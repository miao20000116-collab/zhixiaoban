"""Job Intelligence Agent — JD analysis, company research, user matching."""

import json
import re

from app.agents.job.schema import (
    CompanyInfo,
    IndustryTrend,
    JobAnalysisResult,
    PositionOverview,
    UserMatch,
)
from app.services.llm.openai_provider import get_llm_provider
from app.services.prompt_loader import load_agent_prompt
from app.services.tools.search import format_search_context, search_company_and_industry


class JobAgent:
    """Analyzes job descriptions and matches against Career Memory."""

    async def analyze(
        self,
        *,
        jd_text: str | None = None,
        position: str | None = None,
        company: str | None = None,
        memory_context: str = "",
    ) -> JobAnalysisResult:
        if not jd_text and not (position or company):
            raise ValueError("需要提供 JD 文本，或岗位名称/公司名称")

        # Light pre-parse for search queries
        hint_position = position or _guess_field(jd_text or "", ["岗位", "职位", "Position", "Job Title"])
        hint_company = company or _guess_field(jd_text or "", ["公司", "Company", "雇主"])
        # Management-title lines like "AI产品负责人：..."
        if not hint_position and jd_text:
            hint_position = _guess_title_from_jd(jd_text)

        search_data = await search_company_and_industry(hint_company, hint_position)
        search_context = format_search_context(search_data)

        system_prompt = load_agent_prompt("job")
        user_content = _build_user_content(
            jd_text=jd_text,
            position=position or hint_position,
            company=company or hint_company,
            memory_context=memory_context,
            search_context=search_context,
        )

        provider = get_llm_provider()
        raw = await provider.complete(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.3,
        )
        result = _parse_result(
            raw,
            jd_text=jd_text,
            position=position or hint_position,
            company=company or hint_company,
            memory_context=memory_context,
        )
        # Fill missing overview from clues
        if not result.position_overview.position and (position or hint_position):
            result.position_overview.position = position or hint_position
        if not result.position_overview.company and (company or hint_company):
            result.position_overview.company = company or hint_company
        if _is_failed_analysis(result):
            return _fallback_analysis(
                jd_text=jd_text,
                position=position or hint_position,
                company=company or hint_company,
                memory_context=memory_context,
            )
        # Clue-only analyses are heuristic — avoid presenting a false-precise score
        if not jd_text:
            summary = result.position_overview.summary or ""
            if "推测" not in summary:
                result.position_overview.summary = (
                    "以下为基于岗位/公司线索的推测分析，非正式 JD 全文解析。"
                    + (f" {summary}" if summary else "")
                ).strip()
            result.user_match.score = 0
            tip = "当前无完整 JD，匹配分为启发式占位（暂不评分）；补充完整 JD 后重跑更准确"
            if tip not in result.user_match.suggestions:
                result.user_match.suggestions = [tip, *list(result.user_match.suggestions or [])]
        return result

    async def run(self, input_data: dict) -> dict:
        result = await self.analyze(
            jd_text=input_data.get("jd_text"),
            position=input_data.get("position"),
            company=input_data.get("company"),
            memory_context=input_data.get("memory_context", ""),
        )
        return result.model_dump()


def _build_user_content(
    *,
    jd_text: str | None,
    position: str | None,
    company: str | None,
    memory_context: str,
    search_context: str,
) -> str:
    parts = [
        f"## 用户职业记忆\n{memory_context or '（暂无职业记忆，匹配分析请说明信息不足）'}",
        f"\n## 外部搜索结果\n{search_context}",
    ]
    if jd_text:
        parts.append(f"\n## JD 原文\n{jd_text}")
        if any(k in jd_text for k in ["负责人", "Leader", "Head", "团队管理", "战略", "商业化"]):
            parts.append(
                "\n## 特别提示\n这是管理/负责人方向 JD：请识别层级为高级/负责人，"
                "突出战略、团队管理、商业化与跨部门协同要求。"
            )
    if position or company:
        mode = "线索推测" if not jd_text else "岗位线索补充"
        parts.append(
            f"\n## 岗位线索（{mode}）\n"
            f"- 岗位：{position or '未知'}\n"
            f"- 公司：{company or '未知'}\n"
            "若无完整 JD，必须基于岗位/公司名称 + 搜索结果做合理推测分析，"
            "并在 summary 明确写「以下为基于岗位/公司线索的推测分析」。"
            "禁止输出「解析失败」。"
        )
    parts.append("\n请输出完整 JSON 岗位分析报告。")
    return "\n".join(parts)


def _guess_field(text: str, labels: list[str]) -> str | None:
    for label in labels:
        match = re.search(rf"{re.escape(label)}\s*[:：]\s*(.+)", text)
        if match:
            value = match.group(1).strip().splitlines()[0].strip()
            if value and len(value) < 80:
                return value
    return None


def _guess_title_from_jd(text: str) -> str | None:
    first = text.strip().splitlines()[0].strip() if text.strip() else ""
    if not first:
        return None
    # "AI产品负责人：..." or "商业化AI产品负责人"
    m = re.match(r"^([^：:]{2,40})\s*[:：]", first)
    if m:
        return m.group(1).strip()
    if any(k in first for k in ["产品经理", "负责人", "Leader", "Head"]) and len(first) <= 40:
        return first
    return None


def _is_failed_analysis(result: JobAnalysisResult) -> bool:
    summary = result.position_overview.summary or ""
    position = (result.position_overview.position or "").strip()
    if "解析失败" in summary or "岗位未知" in summary:
        return True
    if position in ("", "未知", "岗位未知", "N/A", "n/a"):
        return True
    if not result.core_responsibilities and not result.required_skills:
        return True
    return False


def _years_from_memory(memory_context: str) -> int | None:
    m = re.search(r"工作年限：(\d+)", memory_context or "")
    return int(m.group(1)) if m else None


def _fallback_analysis(
    *,
    jd_text: str | None,
    position: str | None,
    company: str | None,
    memory_context: str = "",
) -> JobAnalysisResult:
    title = position or (_guess_title_from_jd(jd_text or "") if jd_text else None) or "目标岗位"
    is_clue_only = not jd_text
    is_manager = any(
        k in f"{title}\n{jd_text or ''}" for k in ["负责人", "Leader", "Head", "团队管理", "战略", "商业化"]
    )
    level = "高级/负责人" if is_manager else "中级"
    years = _years_from_memory(memory_context)
    strengths: list[str] = []
    gaps: list[str] = []
    if "增长" in (memory_context or "") or "DAU" in (memory_context or ""):
        strengths.append("有增长/留存相关经历，可迁移到产品指标设计")
    if "AI" in (memory_context or "") or "Agent" in (memory_context or ""):
        strengths.append("对 AI 方向有关注或相关积累")
    if not strengths:
        strengths.append("可基于已有产品经验迁移，但需补充岗位专属证据")
    if is_manager:
        gaps.append("负责人岗通常要求团队管理与战略落地经验，需核验是否具备")
        if years is not None and years < 8:
            gaps.append(f"JD/岗位常见要求约 8 年产品经验，当前记忆显示约 {years} 年，存在年限缺口")
        gaps.append("商业化目标与跨部门资源协调经验需补充证明")
    else:
        gaps.append("完整 JD 缺失或解析不完整，技能要求仍需用正式 JD 校准")

    responsibilities = []
    skills = []
    if jd_text:
        if "战略" in jd_text:
            responsibilities.append("AI 产品战略与方向规划")
        if "团队管理" in jd_text or "管理" in jd_text:
            responsibilities.append("团队管理与人才发展")
        if "商业化" in jd_text:
            responsibilities.append("商业化目标制定与推进")
        if "跨" in jd_text:
            responsibilities.append("跨部门资源协调")
        for k in ["产品", "LLM", "RAG", "Agent", "评测", "增长"]:
            if k in jd_text:
                skills.append(k)
    if is_clue_only:
        responsibilities = [
            f"围绕{title}推进产品规划与落地",
            "协同设计/研发/运营推进关键指标",
            "组织需求分析、方案设计与效果复盘",
        ]
        skills = ["产品规划", "需求分析", "跨团队协作", "数据意识"]
        if "AI" in title:
            skills.extend(["LLM 产品化理解", "Prompt/评测意识"])

    summary = (
        "以下为基于岗位/公司线索的推测分析，非正式 JD 全文解析；匹配分为启发式占位，建议补充完整 JD 后再精修。"
        if is_clue_only
        else f"基于 JD 关键词的规则兜底分析（模型结构化输出异常时启用）：{title}。"
    )

    return JobAnalysisResult(
        position_overview=PositionOverview(
            position=title,
            company=company,
            industry="互联网/AI" if "AI" in title or (company or "") else None,
            level=level,
            summary=summary,
        ),
        core_responsibilities=responsibilities or [f"{title}相关核心职责（待完整 JD 补充）"],
        required_skills=skills or ["产品能力", "沟通协作"],
        nice_to_have_skills=["行业洞察", "商业意识"] if is_manager else ["AI 工具实践"],
        hidden_requirements=["管理经验与年限门槛"] if is_manager else ["完整 JD 细节"],
        interview_focus=["战略判断", "带队案例", "商业化结果"] if is_manager else ["项目深挖", "指标口径"],
        company_analysis=CompanyInfo(
            overview=f"{company}相关业务需结合公开信息进一步核实" if company else "公司未提供",
            is_inferred=True,
            sources=["岗位线索推测"],
        ),
        industry_trends=IndustryTrend(
            summary="AI 产品岗位持续强调落地与评测能力" if "AI" in title else None,
            is_inferred=True,
        ),
        user_match=UserMatch(
            # No full JD → do not present a precise match percentage
            score=0 if is_clue_only else (45 if is_manager else 55),
            strengths=strengths,
            gaps=gaps,
            suggestions=(
                [
                    "当前无完整 JD，匹配分仅为启发式占位（暂不评分）；补充完整 JD 后重跑更准确",
                    "用真实项目证据对齐岗位核心职责关键词",
                ]
                if is_clue_only
                else [
                    "补充完整 JD 后重跑分析",
                    "用真实项目证据对齐负责人/核心职责关键词",
                ]
            ),
        ),
    )


def _parse_result(
    raw: str,
    *,
    jd_text: str | None = None,
    position: str | None = None,
    company: str | None = None,
    memory_context: str = "",
) -> JobAnalysisResult:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        data = json.loads(cleaned)
        return JobAnalysisResult.model_validate(data)
    except (json.JSONDecodeError, TypeError, ValueError):
        return _fallback_analysis(
            jd_text=jd_text,
            position=position,
            company=company,
            memory_context=memory_context,
        )
