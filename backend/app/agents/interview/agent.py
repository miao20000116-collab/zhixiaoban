"""Interview Agent — question bank, mock interview turns, review."""

from __future__ import annotations

import json
import re
from typing import Any, Literal

from app.agents.interview.schema import (
    DimensionScore,
    InterviewMode,
    InterviewReviewResult,
    InterviewStage,
    InterviewTurnResult,
    QuestionBankResult,
    STAGE_LABELS,
    next_stage,
)
from app.services.llm.openai_provider import get_llm_provider
from app.services.prompt_loader import load_agent_prompt

TaskType = Literal["generate_questions", "next_turn", "review"]


class InterviewAgent:
    """AI interviewer with state-machine-driven mock interviews."""

    async def generate_questions(
        self,
        *,
        position: str | None = None,
        jd_text: str | None = None,
        resume_text: str | None = None,
        memory_context: str = "",
        mode: InterviewMode = "full",
    ) -> QuestionBankResult:
        raw = await self._complete(
            "generate_questions",
            position=position,
            jd_text=jd_text,
            resume_text=resume_text,
            memory_context=memory_context,
            mode=mode,
        )
        result = _parse_model(raw, QuestionBankResult)
        if not result.position:
            result.position = position
        return result

    async def next_turn(
        self,
        *,
        stage: InterviewStage,
        mode: InterviewMode,
        user_message: str,
        transcript: list[dict[str, str]],
        position: str | None = None,
        jd_text: str | None = None,
        resume_text: str | None = None,
        memory_context: str = "",
        question_bank: dict | None = None,
        turns_in_stage: int = 0,
    ) -> InterviewTurnResult:
        # Hard rules before LLM
        if _wants_end(user_message):
            return InterviewTurnResult(
                stage="END",
                previous_stage=stage,
                action="end",
                question="",
                interview_complete=True,
                message_to_user="好的，我们结束本轮模拟面试，接下来给你复盘报告。",
            )

        if stage == "START":
            first = "SELF_INTRO" if mode == "full" else "TECHNICAL"
            opening = _personalized_opening(
                mode=mode,
                position=position,
                memory_context=memory_context,
                resume_text=resume_text,
            )
            return InterviewTurnResult(
                stage=first,
                previous_stage="START",
                action="transition",
                question=opening,
                question_type="self_intro" if mode == "full" else "technical",
                stage_complete=False,
                message_to_user=f"当前环节：{STAGE_LABELS.get(first, first)}",
            )

        if stage == "REVERSE_QA" and _user_done_asking(user_message):
            return InterviewTurnResult(
                stage="END",
                previous_stage="REVERSE_QA",
                action="end",
                question="",
                interview_complete=True,
                message_to_user="反问环节结束。下面生成面试复盘。",
            )

        raw = await self._complete(
            "next_turn",
            stage=stage,
            mode=mode,
            user_message=user_message,
            transcript=transcript,
            position=position,
            jd_text=jd_text,
            resume_text=resume_text,
            memory_context=memory_context,
            question_bank=question_bank,
            turns_in_stage=turns_in_stage,
        )
        result = _parse_model(raw, InterviewTurnResult)

        # Guardrails: keep stage valid; advance when stage_complete
        if result.stage_complete and not result.interview_complete:
            nxt = next_stage(stage, mode)
            result.previous_stage = stage
            result.stage = nxt
            result.action = "end" if nxt == "END" else "transition"
            if nxt == "END":
                result.interview_complete = True
                result.message_to_user = result.message_to_user or "本轮面试结束，开始复盘。"
            elif not result.question and nxt == "REVERSE_QA":
                result.question = "你有什么想问我的吗？（关于团队、业务、成长或岗位要求都可以）"
                result.question_type = "reverse"

        if result.interview_complete:
            result.stage = "END"
            result.action = "end"

        # Ensure we always have something to say unless ending
        if result.stage != "END" and not (result.question or result.message_to_user):
            result.question = "能再具体展开一下吗？可以结合你实际做过的事情说明。"
            result.action = "follow_up"

        return result

    async def review(
        self,
        *,
        transcript: list[dict[str, str]],
        position: str | None = None,
        jd_text: str | None = None,
        resume_text: str | None = None,
        memory_context: str = "",
        mode: InterviewMode = "full",
    ) -> InterviewReviewResult:
        raw = await self._complete(
            "review",
            transcript=transcript,
            position=position,
            jd_text=jd_text,
            resume_text=resume_text,
            memory_context=memory_context,
            mode=mode,
        )
        result = _parse_model(raw, InterviewReviewResult, transcript=transcript, position=position)
        if _is_failed_review(result):
            return _fallback_review_from_transcript(transcript, position=position)
        return result

    async def run(self, input_data: dict) -> dict:
        task = input_data.get("task", "next_turn")
        if task == "generate_questions":
            return (
                await self.generate_questions(
                    position=input_data.get("position"),
                    jd_text=input_data.get("jd_text"),
                    resume_text=input_data.get("resume_text"),
                    memory_context=input_data.get("memory_context", ""),
                    mode=input_data.get("mode", "full"),
                )
            ).model_dump()
        if task == "review":
            return (
                await self.review(
                    transcript=input_data.get("transcript", []),
                    position=input_data.get("position"),
                    jd_text=input_data.get("jd_text"),
                    resume_text=input_data.get("resume_text"),
                    memory_context=input_data.get("memory_context", ""),
                    mode=input_data.get("mode", "full"),
                )
            ).model_dump()
        return (
            await self.next_turn(
                stage=input_data.get("stage", "START"),
                mode=input_data.get("mode", "full"),
                user_message=input_data.get("user_message", ""),
                transcript=input_data.get("transcript", []),
                position=input_data.get("position"),
                jd_text=input_data.get("jd_text"),
                resume_text=input_data.get("resume_text"),
                memory_context=input_data.get("memory_context", ""),
                question_bank=input_data.get("question_bank"),
                turns_in_stage=int(input_data.get("turns_in_stage", 0)),
            )
        ).model_dump()

    async def _complete(
        self,
        task: TaskType,
        *,
        stage: InterviewStage | None = None,
        mode: InterviewMode = "full",
        user_message: str = "",
        transcript: list[dict[str, str]] | None = None,
        position: str | None = None,
        jd_text: str | None = None,
        resume_text: str | None = None,
        memory_context: str = "",
        question_bank: dict | None = None,
        turns_in_stage: int = 0,
    ) -> str:
        system_prompt = load_agent_prompt("interview")
        parts = [
            f"## 任务类型\n{task}",
            f"\n## 面试模式\n{mode}",
            f"\n## 用户职业记忆\n{memory_context or '（暂无）'}",
        ]
        if position:
            parts.append(f"\n## 目标岗位\n{position}")
        if jd_text:
            parts.append(f"\n## JD\n{jd_text}")
        if resume_text:
            parts.append(f"\n## 简历/经历\n{resume_text}")
        if question_bank:
            parts.append(f"\n## 题库（可参考，勿一次全问）\n```json\n{json.dumps(question_bank, ensure_ascii=False)[:4000]}\n```")
        if stage:
            parts.append(
                f"\n## 当前状态\n- stage: {stage}（{STAGE_LABELS.get(stage, stage)}）\n"
                f"- turns_in_stage: {turns_in_stage}\n"
                f"- 建议：同阶段追问 1–2 次后可 stage_complete=true 进入下一阶段"
            )
        if transcript:
            lines = []
            for t in transcript[-16:]:
                lines.append(f"- {t.get('role', 'user')}: {t.get('content', '')[:500]}")
            parts.append("\n## 面试对话记录\n" + "\n".join(lines))
        if user_message:
            parts.append(f"\n## 用户本轮发言\n{user_message}")

        if task == "generate_questions":
            focus = (
                "请重点生成技术题，覆盖 LLM、RAG、Agent、Prompt、Evaluation；其他类别可少量。"
                if mode == "technical_interview"
                else "请均衡生成行为题、业务题、项目题、技术题。"
            )
            parts.append(f"\n## 要求\n{focus}\n每类 3–5 题。只输出 JSON。")
        elif task == "next_turn":
            parts.append(
                "\n## 要求\n根据状态机与用户回答，决定追问或进入下一阶段。"
                "一次只输出一个问题。只输出 next_turn JSON。"
            )
        else:
            parts.append("\n## 要求\n基于完整对话生成复盘。只输出 review JSON。")

        provider = get_llm_provider()
        return await provider.complete(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": "\n".join(parts)},
            ],
            temperature=0.4 if task == "next_turn" else 0.3,
        )


def _wants_end(text: str) -> bool:
    keys = ["结束面试", "面试结束", "开始复盘", "给我复盘", "不想面了", "停止面试"]
    return any(k in text for k in keys)


def _user_done_asking(text: str) -> bool:
    keys = ["没有问题了", "没问题了", "我问完了", "没有了", "结束吧", "可以结束", "谢谢没有"]
    t = text.strip()
    if any(k in t for k in keys):
        return True
    return len(t) <= 8 and any(k in t for k in ["没有", "没了", "结束"])


def _strip_json(raw: str) -> str:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned


def _personalized_opening(
    *,
    mode: InterviewMode,
    position: str | None,
    memory_context: str,
    resume_text: str | None,
) -> str:
    blob = f"{memory_context or ''}\n{resume_text or ''}"
    hooks: list[str] = []
    for key in ["浏览器", "DAU", "留存", "增长", "CTR", "A/B", "RAG", "Agent"]:
        if key.lower() in blob.lower() or key in blob:
            hooks.append(key)
    # de-dupe keep order
    seen: set[str] = set()
    hooks = [h for h in hooks if not (h in seen or seen.add(h))]  # type: ignore[func-returns-value]
    role = position or "目标岗位"
    if mode == "technical_interview":
        return (
            f"我们开始针对{role}的技术专项面试。"
            "请先用 1 分钟说明你对 LLM / RAG / Agent 的理解与实践边界"
            "（没有真实项目也可以如实说明课程/自学经历），然后我开始提问。"
        )
    if "浏览器" in blob and any(k in blob for k in ["DAU", "留存", "增长"]):
        return (
            f"你有浏览器增长、DAU 和留存优化经历。"
            f"请用 1–2 分钟介绍自己，并重点说明这段增长经历如何迁移到{role}岗位。"
        )
    if hooks:
        focus = "、".join(hooks[:4])
        return (
            f"欢迎参加{role}模拟面试。你有与{focus}相关的经历。"
            f"请用 1–2 分钟介绍自己，并重点说明这些经历如何迁移到{role}。"
        )
    return (
        f"欢迎参加{role}模拟面试。请先用 1–2 分钟做自我介绍，"
        "重点说明与目标岗位相关的真实经历与可迁移能力。"
    )


def _is_failed_review(review: InterviewReviewResult) -> bool:
    weak = " ".join(review.weaknesses or [])
    sugg = " ".join(review.improvement_suggestions or [])
    strength = " ".join(review.strengths or [])
    blob = f"{weak} {sugg} {strength}"
    if any(k in blob for k in ["解析失败", "请重新生成复盘", "复盘解析失败"]):
        return True
    if all(x in ("", "（暂无）", "暂无") for x in (strength.strip(), weak.strip())):
        return True
    if not review.strengths and not review.weaknesses:
        return True
    if len(review.strengths) < 1 and len(review.improvement_suggestions) < 1:
        return True
    return False


def _fallback_review_from_transcript(
    transcript: list[dict[str, str]],
    *,
    position: str | None = None,
) -> InterviewReviewResult:
    """User-facing review when LLM JSON parse fails — never show 解析失败."""
    user_answers = [
        (t.get("content") or "").strip()
        for t in transcript
        if t.get("role") == "user" and (t.get("content") or "").strip()
    ]
    joined = " ".join(user_answers)
    strengths: list[str] = []
    weaknesses: list[str] = []
    suggestions: list[str] = []

    if any(k in joined for k in ["指标", "DAU", "留存", "CTR", "%", "提升"]):
        strengths.append("能够提到业务指标或量化结果，有数据意识。")
    if any(k in joined for k in ["因为", "所以", "权衡", "取舍", "原因"]):
        strengths.append("回答中有一定因果关系与决策解释。")
    if any(k in joined for k in ["复盘", "迭代", "实验", "A/B", "假设"]):
        strengths.append("提到了实验/复盘思路，具备产品迭代意识。")
    if len(user_answers) >= 2:
        strengths.append("本轮有多段完整作答，配合度较好。")
    while len(strengths) < 2:
        strengths.append("表达基本完整，能够围绕问题作答。")

    if len(joined) < 120:
        weaknesses.append("回答偏短，细节与证据不足。")
    else:
        weaknesses.append("部分回答还可以补充背景、动作与结果的完整闭环。")
    if not any(k in joined for k in ["指标", "%", "提升", "DAU", "留存"]):
        weaknesses.append("量化结果或指标口径交代不够清晰。")
    while len(weaknesses) < 2:
        weaknesses.append("与目标岗位的迁移逻辑可以再讲清楚。")

    suggestions = [
        "用 STAR 结构重讲一段核心项目：情境、任务、行动、结果各一句。",
        "为关键指标补口径：定义、统计窗口、对比基线。",
        "明确你个人贡献边界：你负责什么、协同什么、如何推动落地。",
    ]
    role = position or "目标岗位"
    score = 68 if len(joined) >= 80 else 60
    return InterviewReviewResult(
        overall_score=score,
        dimensions=[
            DimensionScore(name="表达结构", score=score, comment="基于本轮对话生成"),
            DimensionScore(name="专业深度", score=max(55, score - 5), comment="基于本轮对话生成"),
            DimensionScore(name="岗位匹配", score=score, comment=f"面向 {role}"),
        ],
        strengths=strengths[:4],
        weaknesses=weaknesses[:4],
        improvement_suggestions=suggestions,
        stage_summary=["基于本轮对话生成的兜底复盘（模型结构化输出异常时启用）"],
    )


def _parse_model(
    raw: str,
    model: type[Any],
    *,
    transcript: list[dict[str, str]] | None = None,
    position: str | None = None,
) -> Any:
    cleaned = _strip_json(raw)
    try:
        data = json.loads(cleaned)
        return model.model_validate(data)
    except (json.JSONDecodeError, TypeError, ValueError):
        if model is QuestionBankResult:
            return QuestionBankResult(notes=["题库生成暂时不可用，请稍后重试或换一种描述"])
        if model is InterviewReviewResult:
            return _fallback_review_from_transcript(transcript or [], position=position)
        return InterviewTurnResult(
            stage="SELF_INTRO",
            action="ask",
            question="请先做一下自我介绍，重点说明与目标岗位相关的经历。",
            question_type="self_intro",
        )
