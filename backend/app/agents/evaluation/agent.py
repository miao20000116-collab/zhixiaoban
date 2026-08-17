"""Evaluation Agent — authenticity, job-match, and interview answer QC."""

from __future__ import annotations

import json
import re

from app.agents.evaluation.schema import EvaluationResult, InterviewAnswerScores
from app.agents.interview.schema import InterviewReviewResult
from app.agents.job.schema import JobAnalysisResult
from app.agents.resume.schema import ResumeOptimizeResult, STAROptimizeResult
from app.services.llm.openai_provider import get_llm_provider
from app.services.prompt_loader import load_agent_prompt


class EvaluationAgent:
    """Internal quality gate for important Agent outputs."""

    async def evaluate_job_analysis(
        self,
        analysis: JobAnalysisResult,
        *,
        jd_text: str | None = None,
        search_context: str = "",
    ) -> EvaluationResult:
        user_content = (
            "## 审核任务：JD 分析真实性 + 岗位匹配检查\n"
            "重点检查：公司信息、行业趋势、岗位要求是否虚构；"
            "是否与搜索结果或 JD 原文矛盾。\n"
            "若分析明确标注推测 / is_inferred=true，且无虚构用户经历，风险应为 low 或最多 medium，"
            "不要仅因信息不足判 high。\n\n"
            f"## JD 原文\n{jd_text or '（无）'}\n\n"
            f"## 搜索上下文\n{search_context or '（无）'}\n\n"
            f"## Job Agent 输出\n```json\n{analysis.model_dump_json(indent=2)}\n```\n\n"
            "请输出 JSON 审核结果。"
        )
        result = await self._evaluate(user_content)
        return _soften_inferred_job_risk(analysis, result)

    async def evaluate_resume_output(
        self,
        *,
        output_json: str,
        source_text: str,
        jd_text: str | None = None,
        target_position: str | None = None,
        task: str = "optimize",
    ) -> EvaluationResult:
        user_content = (
            "## 审核任务：简历输出真实性 + 岗位匹配检查\n"
            "强约束：禁止虚构项目、数据、职责；禁止把「参与」夸大为「主导」。\n"
            "对原文已有上下文支持的轻微结构化改写 / 合理归纳应判 low；"
            "仅当新增公司、项目、指标、职位、技术栈时才判 medium/high。\n"
            "若目标岗位明确，检查内容是否贴合岗位（而非偏题堆砌）。\n"
            f"任务类型：{task}\n\n"
            f"## 简历/经历原文（唯一事实来源）\n{source_text or '（无）'}\n\n"
            f"## 目标岗位\n{target_position or '（无）'}\n\n"
            f"## 目标 JD\n{jd_text or '（无）'}\n\n"
            f"## Resume Agent 输出\n```json\n{output_json}\n```\n\n"
            "请输出 JSON 审核结果。若发现夸大或无依据的数据/职责，写入 fabricated_claims 与 issues，"
            "risk_level 至少 medium。"
        )
        return await self._evaluate(user_content)

    async def evaluate_resume_optimize(
        self,
        result: ResumeOptimizeResult,
        *,
        resume_text: str,
        jd_text: str | None = None,
        target_position: str | None = None,
    ) -> EvaluationResult:
        return await self.evaluate_resume_output(
            output_json=result.model_dump_json(indent=2),
            source_text=resume_text,
            jd_text=jd_text,
            target_position=target_position or result.target_position,
            task="optimize",
        )

    async def evaluate_star(
        self,
        result: STAROptimizeResult,
        *,
        source_text: str,
        target_position: str | None = None,
    ) -> EvaluationResult:
        return await self.evaluate_resume_output(
            output_json=result.model_dump_json(indent=2),
            source_text=source_text,
            target_position=target_position,
            task="star",
        )

    async def evaluate_job_match(
        self,
        *,
        content: str,
        target_position: str,
        jd_text: str | None = None,
    ) -> EvaluationResult:
        user_content = (
            "## 审核任务：岗位匹配检查\n"
            "检查生成内容是否符合目标岗位；若大量突出无关经历需提示。\n\n"
            f"## 目标岗位\n{target_position}\n\n"
            f"## 目标 JD\n{jd_text or '（无）'}\n\n"
            f"## 待检查内容\n{content}\n\n"
            "请输出 JSON，填充 job_match_score / job_match_notes / problems / suggestions。"
        )
        return await self._evaluate(user_content)

    async def evaluate_interview_answer(
        self,
        *,
        question: str,
        answer: str,
        position: str | None = None,
        jd_text: str | None = None,
        resume_text: str | None = None,
    ) -> InterviewAnswerScores:
        user_content = (
            "## 审核任务：面试回答质量评分\n"
            "按维度打分（0-100）：问题理解20%、结构表达20%、专业能力30%、岗位匹配20%、真实性10%。\n"
            "真实性：回答是否编造简历中没有的经历/数据。\n\n"
            f"## 目标岗位\n{position or '（无）'}\n\n"
            f"## JD\n{jd_text or '（无）'}\n\n"
            f"## 简历摘要\n{(resume_text or '（无）')[:3000]}\n\n"
            f"## 面试问题\n{question}\n\n"
            f"## 用户回答\n{answer}\n\n"
            "请输出含 understanding/structure/expertise/job_match/authenticity/overall/comments 的 JSON。"
        )
        system_prompt = load_agent_prompt("evaluation")
        provider = get_llm_provider()
        raw = await provider.complete(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.1,
        )
        return _parse_answer_scores(raw)

    async def evaluate_interview_review(
        self,
        review: InterviewReviewResult,
        *,
        transcript: list[dict[str, str]],
        resume_text: str | None = None,
        jd_text: str | None = None,
    ) -> EvaluationResult:
        transcript_text = "\n".join(
            f"{t.get('role', 'user')}: {t.get('content', '')}" for t in transcript[-30:]
        )
        user_content = (
            "## 审核任务：面试复盘真实性检查\n"
            "检查复盘是否把用户没说过的经历/数据当成事实；"
            "评分是否明显脱离对话内容。\n\n"
            f"## 简历/记忆\n{resume_text or '（无）'}\n\n"
            f"## JD\n{jd_text or '（无）'}\n\n"
            f"## 面试对话\n{transcript_text or '（无）'}\n\n"
            f"## 复盘输出\n```json\n{review.model_dump_json(indent=2)}\n```\n\n"
            "请输出 JSON 审核结果。"
        )
        return await self._evaluate(user_content)

    async def evaluate_career_gap(
        self,
        *,
        gap_json: str,
        memory_context: str = "",
        target_jd: str | None = None,
        target_position: str | None = None,
    ) -> EvaluationResult:
        heuristic = _heuristic_career_gap(gap_json, memory_context)
        user_content = (
            "## 审核任务：Career Gap 真实性\n"
            "必须逐项检查：\n"
            "1. 优势是否基于用户真实经历 / Career Memory（不可虚构能力）；\n"
            "2. 缺口是否引用 JD / 岗位要求中的具体条款；\n"
            "3. 是否存在虚构项目、技能或成果；\n"
            "4. 提升建议是否合理、可执行，且对应缺口；\n"
            "5. 若建议含「包装为实战/落地」→ 不合格，写入 fabricated_claims。\n"
            "仅给分数而无解释、无 evidence 视为不合格。\n\n"
            f"## 目标岗位\n{target_position or '（无）'}\n\n"
            f"## 目标 JD\n{target_jd or '（无）'}\n\n"
            f"## 用户 Career Memory\n{memory_context or '（无）'}\n\n"
            f"## Gap Analysis 输出\n```json\n{gap_json}\n```\n\n"
            "若发现无依据优势或编造经历，写入 fabricated_claims，risk_level 至少 medium。"
        )
        result = await self._evaluate(user_content)
        return _merge_heuristic(result, heuristic)

    async def evaluate_recommendation(
        self,
        *,
        plan_json: str,
        memory_context: str = "",
        gap_context: str = "",
        task_context: str = "",
    ) -> EvaluationResult:
        heuristic = _heuristic_recommendation(plan_json)
        user_content = (
            "## 审核任务：Recommendation 合理性\n"
            "检查每条建议是否来自 JD / Memory / Gap / Task / Knowledge 之一；"
            "禁止无依据建议；若 why/sources 缺失需指出；"
            "过度承诺（保证拿 offer 等）需指出。\n\n"
            f"## Career Memory\n{memory_context or '（无）'}\n\n"
            f"## Gap\n{gap_context or '（无）'}\n\n"
            f"## Task Memory\n{task_context or '（无）'}\n\n"
            f"## Recommendation 输出\n```json\n{plan_json}\n```\n\n"
            "请输出 JSON 审核结果。"
        )
        result = await self._evaluate(user_content)
        return _merge_heuristic(result, heuristic)

    async def run(self, input_data: dict) -> dict:
        kind = input_data.get("kind", "job")
        if kind == "resume":
            result = await self.evaluate_resume_output(
                output_json=json.dumps(input_data.get("output", {}), ensure_ascii=False),
                source_text=input_data.get("source_text", ""),
                jd_text=input_data.get("jd_text"),
                target_position=input_data.get("target_position"),
                task=input_data.get("task", "optimize"),
            )
            return result.model_dump()
        if kind == "interview":
            review = InterviewReviewResult.model_validate(input_data.get("review", {}))
            result = await self.evaluate_interview_review(
                review,
                transcript=input_data.get("transcript", []),
                resume_text=input_data.get("resume_text"),
                jd_text=input_data.get("jd_text"),
            )
            return result.model_dump()
        if kind == "interview_answer":
            scores = await self.evaluate_interview_answer(
                question=input_data.get("question", ""),
                answer=input_data.get("answer", ""),
                position=input_data.get("position"),
                jd_text=input_data.get("jd_text"),
                resume_text=input_data.get("resume_text"),
            )
            return scores.model_dump()
        if kind == "job_match":
            result = await self.evaluate_job_match(
                content=input_data.get("content", ""),
                target_position=input_data.get("target_position", ""),
                jd_text=input_data.get("jd_text"),
            )
            return result.model_dump()
        if kind == "career_gap":
            result = await self.evaluate_career_gap(
                gap_json=json.dumps(input_data.get("gap", {}), ensure_ascii=False, indent=2),
                memory_context=input_data.get("memory_context", ""),
                target_jd=input_data.get("target_jd"),
                target_position=input_data.get("target_position"),
            )
            return result.model_dump()
        if kind == "recommendation":
            result = await self.evaluate_recommendation(
                plan_json=json.dumps(input_data.get("plan", {}), ensure_ascii=False, indent=2),
                memory_context=input_data.get("memory_context", ""),
                gap_context=input_data.get("gap_context", ""),
                task_context=input_data.get("task_context", ""),
            )
            return result.model_dump()

        analysis = JobAnalysisResult.model_validate(input_data.get("analysis", {}))
        result = await self.evaluate_job_analysis(
            analysis,
            jd_text=input_data.get("jd_text"),
            search_context=input_data.get("search_context", ""),
        )
        return result.model_dump()

    async def _evaluate(self, user_content: str) -> EvaluationResult:
        system_prompt = load_agent_prompt("evaluation")
        provider = get_llm_provider()
        raw = await provider.complete(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.1,
        )
        return _parse_result(raw)


def _strip_json(raw: str) -> str:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned


def _risk_rank(level: str) -> int:
    order = {"low": 0, "medium": 1, "high": 2}
    return order.get(level, 0)


def _merge_heuristic(llm: EvaluationResult, heuristic: EvaluationResult | None) -> EvaluationResult:
    if heuristic is None:
        return llm
    if _risk_rank(heuristic.risk_level) > _risk_rank(llm.risk_level):
        llm.risk_level = heuristic.risk_level
    if heuristic.score < llm.score:
        llm.score = heuristic.score
    for p in heuristic.problems:
        if p not in llm.problems:
            llm.problems.append(p)
    for s in heuristic.suggestions:
        if s not in llm.suggestions:
            llm.suggestions.append(s)
    for c in heuristic.fabricated_claims:
        if c not in llm.fabricated_claims:
            llm.fabricated_claims.append(c)
    return llm


def _soften_inferred_job_risk(analysis: JobAnalysisResult, result: EvaluationResult) -> EvaluationResult:
    """Don't mark clearly-inferred, non-fabricating job analysis as high."""
    company = analysis.company_analysis
    industry = analysis.industry_trends
    inferred = bool(
        (company and company.is_inferred)
        or (industry and industry.is_inferred)
        or ("推测" in (analysis.position_overview.summary or ""))
    )
    if inferred and result.risk_level == "high" and not result.fabricated_claims:
        result.risk_level = "medium"
        note = "内容含明确推测标注且未见虚构用户经历，风险从 high 下调为 medium"
        if note not in result.suggestions:
            result.suggestions.append(note)
    return result


def _heuristic_career_gap(gap_json: str, memory_context: str) -> EvaluationResult | None:
    try:
        data = json.loads(gap_json) if isinstance(gap_json, str) else gap_json
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, dict):
        return None

    memory = memory_context or ""
    fabricated: list[str] = []
    problems: list[str] = []
    has_constraint = any(
        k in memory for k in ["没有真实RAG", "没有真实 RAG", "只上过", "只是上过", "无真实RAG", "不要虚构", "不希望虚构"]
    )

    strengths = data.get("strengths") or []
    for s in strengths:
        if not isinstance(s, dict):
            continue
        title = str(s.get("title") or "")
        reason = str(s.get("reason") or "")
        evidence = s.get("evidence") or []
        claim = f"{title} {reason}"
        if ("RAG" in claim or "rag" in claim.lower()) and any(
            k in memory for k in ["没有真实RAG", "没有真实 RAG", "只上过", "只是上过", "无真实RAG"]
        ):
            fabricated.append(title or claim)
            problems.append("无依据/虚构 RAG 经验：与 Career Memory 约束冲突")
        if not evidence:
            problems.append(f"优势「{title or '未命名'}」缺少 evidence（无依据）")
            if title:
                fabricated.append(title)

    recs = data.get("recommendations") or []
    packaging_keys = ("包装为", "包装成", "写成实战", "当作落地", "包装成落地", "包装为实战", "包装为RAG")
    for r in recs:
        if not isinstance(r, dict):
            blob = str(r)
        else:
            blob = f"{r.get('action') or ''} {r.get('why') or ''}"
        if any(k in blob for k in packaging_keys):
            problems.append("建议含包装式话术（包装为实战/落地），与真实性原则冲突")
            fabricated.append(blob.strip()[:120] or "包装式建议")
            if has_constraint:
                problems.append("在用户约束（无真实经历/仅课程）下仍建议包装履历")

    if not fabricated and not problems:
        return None
    return EvaluationResult(
        risk_level="medium",
        score=40,
        problems=problems or ["存在无依据优势"],
        suggestions=[
            "删除或改写无 Career Memory 依据的优势，并补充 evidence",
            "建议改为坦诚缺口 + 可执行补齐，禁止「包装为实战」",
        ],
        fabricated_claims=fabricated,
    )


def _heuristic_recommendation(plan_json: str) -> EvaluationResult | None:
    try:
        data = json.loads(plan_json) if isinstance(plan_json, str) else plan_json
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, dict):
        return None

    problems: list[str] = []
    for rec in data.get("recommendations") or []:
        if not isinstance(rec, dict):
            continue
        action = str(rec.get("action") or "")
        sources = rec.get("sources") or []
        why = rec.get("why")
        if not sources:
            problems.append(f"建议「{action or '未命名'}」缺少 sources")
        if not why:
            problems.append(f"建议「{action or '未命名'}」缺少 why")
        blob = f"{action} {why or ''}"
        if any(k in blob for k in ["保证拿offer", "保证拿 Offer", "一定能进", "包过"]):
            problems.append("存在过度承诺表述")

    summary = str(data.get("summary") or "")
    if "解析失败" in summary:
        problems.append("输出含内部失败文案，不应展示给用户")

    if not problems:
        return None
    return EvaluationResult(
        risk_level="medium",
        score=45,
        problems=problems,
        suggestions=["为每条建议补齐 why 与 sources，并去掉过度承诺"],
        fabricated_claims=[],
    )


def _parse_result(raw: str) -> EvaluationResult:
    cleaned = _strip_json(raw)
    try:
        data = json.loads(cleaned)
        # Normalize not_applicable from prompt into medium for schema safety
        if data.get("risk_level") == "not_applicable":
            data["risk_level"] = "low"
            data.setdefault("problems", []).append("输入不足，评分不适用")
        return EvaluationResult.model_validate(data)
    except (json.JSONDecodeError, TypeError, ValueError):
        return EvaluationResult(
            risk_level="medium",
            score=50,
            problems=["Evaluation 结果解析失败，请人工复核真实性"],
            suggestions=["对照原文核实是否存在夸大职责或虚构数据"],
            fabricated_claims=[],
        )


def _parse_answer_scores(raw: str) -> InterviewAnswerScores:
    cleaned = _strip_json(raw)
    try:
        data = json.loads(cleaned)
        scores = InterviewAnswerScores.model_validate(data)
        if "overall" not in data:
            scores.overall = scores.compute_overall()
        return scores
    except (json.JSONDecodeError, TypeError, ValueError):
        return InterviewAnswerScores(
            overall=50,
            comments=["评分解析失败，请人工复核"],
        )
