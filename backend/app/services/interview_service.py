"""Interview Agent orchestration: start, turn, review, question bank."""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.agents.evaluation.agent import EvaluationAgent
from app.agents.evaluation.schema import EvaluationResult
from app.agents.interview.agent import InterviewAgent
from app.agents.interview.schema import (
    STAGE_LABELS,
    InterviewMode,
    InterviewQuestion,
    InterviewReviewResult,
    InterviewStage,
    InterviewTurnResult,
    QuestionBankResult,
)
from app.evaluation import finish_run, new_trace, save_evaluation_record, traced_run
from app.memory.service import build_memory_context
from app.models.interview_session import InterviewSession
from app.services.career_status_service import record_interview_completed
from app.services.recommendation import format_recommendation_markdown, recommend_after_interview


def detect_interview_mode(text: str) -> InterviewMode:
    keys = [
        "问我一些技术问题",
        "技术面试",
        "技术专项",
        "technical_interview",
        "考我技术",
        "LLM",
        "RAG",
        "问我Agent",
        "问我 Prompt",
        "Evaluation",
    ]
    # Strong signals for technical-only
    strong = ["问我一些技术问题", "技术专项面试", "只问技术", "technical_interview", "技术面试专项"]
    if any(k in text for k in strong):
        return "technical_interview"
    # If explicitly asks tech topics without full mock
    if any(k in text for k in ["考我 RAG", "考我 LLM", "考我 Agent", "考我 Prompt"]):
        return "technical_interview"
    return "full"


def looks_like_start_interview(text: str) -> bool:
    keys = [
        "开始模拟面试",
        "模拟面试",
        "开始面试",
        "来一场面试",
        "面试我",
        "问我一些技术问题",
        "技术专项面试",
        "帮我面试",
    ]
    return any(k in text for k in keys)


def extract_interview_context(text: str) -> dict[str, str | None]:
    position = None
    m = re.search(r"(?:岗位|职位|应聘)[:：]?\s*([^\n,，。]{2,40})", text)
    if m:
        position = m.group(1).strip()
    elif "AI产品经理" in text or "ai产品经理" in text.lower():
        position = "AI产品经理"

    jd_text = None
    if len(text) >= 80 and any(k in text for k in ["职责", "要求", "岗位", "JD", "招聘", "Responsibilities"]):
        # Strip command prefixes for cleaner JD
        jd_text = re.sub(
            r"^(?:开始模拟面试|模拟面试|开始面试)[，,：:\s]*",
            "",
            text,
            flags=re.IGNORECASE,
        ).strip()
        if len(jd_text) < 40:
            jd_text = text

    return {"position": position, "jd_text": jd_text}


async def generate_question_bank(
    db: Session,
    *,
    user_id: uuid.UUID,
    position: str | None = None,
    jd_text: str | None = None,
    resume_text: str | None = None,
    mode: InterviewMode = "full",
) -> QuestionBankResult:
    memory = build_memory_context(db, user_id)
    return await InterviewAgent().generate_questions(
        position=position,
        jd_text=jd_text,
        resume_text=resume_text or memory,
        memory_context=memory,
        mode=mode,
    )


async def start_interview(
    db: Session,
    *,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID | None = None,
    position: str | None = None,
    jd_text: str | None = None,
    resume_text: str | None = None,
    mode: InterviewMode = "full",
    quick: bool = False,
) -> tuple[InterviewSession, InterviewTurnResult, str]:
    """Create session, optionally generate bank, advance from START to first question.

    quick=True (voice dial): skip bank LLM + first-turn LLM; use a ready intro question
    so the call connects in ~1s instead of waiting for two model round-trips + TTS.
    """
    # Complete any prior active session on same conversation
    if conversation_id:
        prior = (
            db.query(InterviewSession)
            .filter(
                InterviewSession.conversation_id == conversation_id,
                InterviewSession.status == "active",
            )
            .all()
        )
        for s in prior:
            s.status = "completed"
            s.stage = "END"
            s.updated_at = datetime.utcnow()

    memory = build_memory_context(db, user_id)
    resume = resume_text or memory or None

    agent = InterviewAgent()
    if quick:
        bank = _quick_question_bank(position=position, mode=mode)
        first = (
            (bank.behavioral[0].question if bank.behavioral else None)
            or f"请用 1～2 分钟介绍你自己，并说明为什么适合{position or '这个岗位'}。"
        )
        turn = InterviewTurnResult(
            stage="SELF_INTRO" if mode == "full" else "TECHNICAL",
            previous_stage="START",
            action="ask",
            question=first,
            question_type="self_intro" if mode == "full" else "technical",
            stage_complete=False,
            interview_complete=False,
        )
    else:
        bank = await agent.generate_questions(
            position=position,
            jd_text=jd_text,
            resume_text=resume,
            memory_context=memory,
            mode=mode,
        )
        turn = await agent.next_turn(
            stage="START",
            mode=mode,
            user_message="开始面试",
            transcript=[],
            position=position or bank.position,
            jd_text=jd_text,
            resume_text=resume,
            memory_context=memory,
            question_bank=bank.model_dump(),
            turns_in_stage=0,
        )

    session = InterviewSession(
        user_id=user_id,
        conversation_id=conversation_id,
        mode=mode,
        stage="START",
        status="active",
        position=position or bank.position,
        jd_text=jd_text,
        resume_text=resume,
        question_bank_json=bank.model_dump(),
        turns_json=[],
        turns_in_stage=0,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    _apply_turn(session, turn, user_message=None, assistant_only=True)
    db.commit()
    db.refresh(session)

    markdown = format_turn_markdown(session, turn)
    return session, turn, markdown


def _quick_question_bank(*, position: str | None, mode: InterviewMode) -> QuestionBankResult:
    """Local starter bank — no LLM. Later turns still call InterviewAgent.next_turn."""
    pos = (position or "").strip() or "目标岗位"
    intro = f"你好，我是今天的面试官。请用 1～2 分钟介绍你自己，并说明为什么适合{pos}。"
    project = "请挑一个最能体现你能力的项目，讲清楚背景、你的职责、关键决策和结果。"
    business = f"如果入职后负责{pos}相关工作，你会如何定义前 90 天的成功指标？"
    technical = "请结合你的经验，说明你会如何用数据或实验验证一个产品假设。"
    if mode == "technical_interview":
        return QuestionBankResult(
            position=pos,
            technical=[
                InterviewQuestion(
                    type="technical",
                    stage="TECHNICAL",
                    question="先做个简短自我介绍，然后选一个你最熟的技术决策讲清楚取舍。",
                ),
                InterviewQuestion(type="technical", stage="TECHNICAL", question=technical),
            ],
            notes=["语音快启题库"],
        )
    return QuestionBankResult(
        position=pos,
        behavioral=[
            InterviewQuestion(type="self_intro", stage="SELF_INTRO", question=intro),
        ],
        project=[
            InterviewQuestion(type="project", stage="PROJECT_DEEP_DIVE", question=project),
        ],
        business=[
            InterviewQuestion(type="business", stage="BUSINESS", question=business),
        ],
        technical=[
            InterviewQuestion(type="technical", stage="TECHNICAL", question=technical),
        ],
        notes=["语音快启题库"],
    )


async def submit_answer(
    db: Session,
    *,
    session: InterviewSession,
    user_message: str,
) -> tuple[InterviewSession, InterviewTurnResult, InterviewReviewResult | None, str]:
    memory = build_memory_context(db, session.user_id)
    transcript = list(session.turns_json or [])
    transcript.append({"role": "user", "content": user_message, "stage": session.stage})

    agent = InterviewAgent()
    turn = await agent.next_turn(
        stage=session.stage,  # type: ignore[arg-type]
        mode=session.mode,  # type: ignore[arg-type]
        user_message=user_message,
        transcript=transcript,
        position=session.position,
        jd_text=session.jd_text,
        resume_text=session.resume_text,
        memory_context=memory,
        question_bank=session.question_bank_json,
        turns_in_stage=session.turns_in_stage,
    )

    _apply_turn(session, turn, user_message=user_message, assistant_only=False)

    review: InterviewReviewResult | None = None
    markdown = format_turn_markdown(session, turn)

    if turn.interview_complete or session.stage == "END":
        review = await _finalize_review(db, session, memory)
        markdown = format_review_markdown(session, review)

    db.commit()
    db.refresh(session)
    return session, turn, review, markdown


async def end_interview(
    db: Session,
    *,
    session: InterviewSession,
) -> tuple[InterviewSession, InterviewReviewResult, str]:
    memory = build_memory_context(db, session.user_id)
    session.stage = "END"
    session.status = "completed"
    session.updated_at = datetime.utcnow()
    review = await _finalize_review(db, session, memory)
    markdown = format_review_markdown(session, review)
    db.commit()
    db.refresh(session)
    return session, review, markdown


def get_active_session(
    db: Session,
    *,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID | None = None,
    session_id: uuid.UUID | None = None,
) -> InterviewSession | None:
    q = db.query(InterviewSession).filter(
        InterviewSession.user_id == user_id,
        InterviewSession.status == "active",
    )
    if session_id:
        return q.filter(InterviewSession.id == session_id).first()
    if conversation_id:
        return (
            q.filter(InterviewSession.conversation_id == conversation_id)
            .order_by(InterviewSession.updated_at.desc())
            .first()
        )
    return q.order_by(InterviewSession.updated_at.desc()).first()


def pause_interview_session(db: Session, session: InterviewSession | None) -> bool:
    """Mark a single interview session as paused. Returns True if status changed."""
    if session is None or session.status != "active":
        return False
    session.status = "paused"
    session.updated_at = datetime.utcnow()
    db.commit()
    return True


def pause_active_sessions(
    db: Session,
    *,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID | None = None,
) -> int:
    """Pause active mock interviews so resume/JD uploads are not treated as answers."""
    q = db.query(InterviewSession).filter(
        InterviewSession.user_id == user_id,
        InterviewSession.status == "active",
    )
    if conversation_id is not None:
        q = q.filter(InterviewSession.conversation_id == conversation_id)
    rows = q.all()
    if not rows:
        return 0
    now = datetime.utcnow()
    for row in rows:
        row.status = "paused"
        row.updated_at = now
    db.commit()
    return len(rows)


def format_turn_markdown(session: InterviewSession, turn: InterviewTurnResult) -> str:
    lines = [
        f"**模拟面试** · {session.mode} · 阶段：{STAGE_LABELS.get(turn.stage, turn.stage)}",
        "",
    ]
    if turn.message_to_user:
        lines.append(turn.message_to_user)
        lines.append("")
    if turn.feedback_brief:
        lines.append(f"> {turn.feedback_brief}")
        lines.append("")
    if turn.question:
        lines.append(f"**面试官：** {turn.question}")
    if turn.interview_complete:
        lines.append("")
        lines.append("_本轮提问结束，正在生成复盘…_")
    return "\n".join(lines)


def format_review_markdown(session: InterviewSession, review: InterviewReviewResult) -> str:
    # Safety net: never render internal parse-failure copy
    strengths = [s for s in (review.strengths or []) if "解析失败" not in s]
    weaknesses = [w for w in (review.weaknesses or []) if "解析失败" not in w]
    suggestions = [
        s
        for s in (review.improvement_suggestions or [])
        if "解析失败" not in s and "请重新生成复盘" not in s
    ]
    if not strengths or not weaknesses or len(suggestions) < 2:
        from app.agents.interview.agent import _fallback_review_from_transcript

        transcript = [
            {"role": t.get("role", "user"), "content": t.get("content", "")}
            for t in (session.turns_json or [])
        ]
        review = _fallback_review_from_transcript(transcript, position=session.position)
        strengths = list(review.strengths)
        weaknesses = list(review.weaknesses)
        suggestions = list(review.improvement_suggestions)

    lines = [
        "# 面试复盘报告",
        "",
        f"**岗位：** {session.position or '未指定'}",
        f"**模式：** {session.mode}",
        f"**综合评分：** {review.overall_score}/100",
        "",
        "## 维度评分",
    ]
    for d in review.dimensions:
        lines.append(f"- **{d.name}：** {d.score}/100" + (f" — {d.comment}" if d.comment else ""))

    lines.extend(["", "## 优势"])
    lines.extend([f"- {s}" for s in strengths] or ["- 表达基本完整，能够围绕问题作答。"])
    lines.extend(["", "## 不足"])
    lines.extend([f"- {w}" for w in weaknesses] or ["- 部分回答还可以补充背景、动作与结果的完整闭环。"])
    lines.extend(["", "## 提升建议"])
    lines.extend([f"- {s}" for s in suggestions] or [
        "- 用 STAR 结构重讲一段核心项目。",
        "- 为关键指标补口径。",
        "- 明确个人贡献边界。",
    ])

    if review.stage_summary:
        lines.extend(["", "## 各阶段小结"])
        lines.extend([f"- {s}" for s in review.stage_summary if "解析失败" not in s])

    if review.evaluation or session.evaluation_json:
        ev = review.evaluation or session.evaluation_json or {}
        lines.extend(
            [
                "",
                "## 真实性检查",
                f"- 风险：{ev.get('risk_level', 'unknown')}",
                f"- 质量分：{ev.get('score', '—')}",
            ]
        )
        for claim in ev.get("fabricated_claims") or []:
            if "解析失败" not in str(claim):
                lines.append(f"- 疑似虚构：{claim}")

    rec = recommend_after_interview(
        weaknesses=weaknesses,
        overall_score=review.overall_score,
    )
    lines.append(format_recommendation_markdown(rec))

    return "\n".join(lines)


def format_question_bank_markdown(bank: QuestionBankResult) -> str:
    lines = [f"# 面试题库", f"**岗位：** {bank.position or '未指定'}", ""]
    mapping = [
        ("behavioral", "行为题"),
        ("business", "业务题"),
        ("project", "项目题"),
        ("technical", "技术题"),
    ]
    for key, title in mapping:
        items = getattr(bank, key) or []
        lines.append(f"## {title}")
        if not items:
            lines.append("- （无）")
        for i, q in enumerate(items, 1):
            lines.append(f"{i}. {q.question}" + (f"（聚焦：{q.focus}）" if q.focus else ""))
        lines.append("")
    return "\n".join(lines)


def _apply_turn(
    session: InterviewSession,
    turn: InterviewTurnResult,
    *,
    user_message: str | None,
    assistant_only: bool,
) -> None:
    turns = list(session.turns_json or [])
    prev_stage = session.stage

    if user_message and not assistant_only:
        turns.append({"role": "user", "content": user_message, "stage": prev_stage})

    assistant_content = turn.question or turn.message_to_user or ""
    if turn.feedback_brief and turn.question:
        assistant_content = f"{turn.feedback_brief}\n\n{turn.question}"
    elif turn.message_to_user and turn.question:
        assistant_content = f"{turn.message_to_user}\n\n{turn.question}"

    if assistant_content:
        turns.append(
            {
                "role": "assistant",
                "content": assistant_content,
                "stage": turn.stage,
                "action": turn.action,
                "question_type": turn.question_type,
            }
        )

    if turn.stage != prev_stage:
        session.turns_in_stage = 1 if turn.stage != "END" else 0
    else:
        session.turns_in_stage = (session.turns_in_stage or 0) + 1

    session.stage = turn.stage
    session.turns_json = turns
    session.updated_at = datetime.utcnow()

    if turn.interview_complete or turn.stage == "END":
        session.stage = "END"
        session.status = "completed"


async def _finalize_review(
    db: Session,
    session: InterviewSession,
    memory: str,
) -> InterviewReviewResult:
    agent = InterviewAgent()
    transcript = [
        {"role": t.get("role", "user"), "content": t.get("content", "")}
        for t in (session.turns_json or [])
    ]
    ctx = new_trace(user_id=session.user_id, conversation_id=session.conversation_id)

    async with traced_run(
        db,
        ctx,
        agent_name="interview",
        task_type="review",
        input_data={"session_id": str(session.id), "mode": session.mode},
    ) as interview_run:
        review = await agent.review(
            transcript=transcript,
            position=session.position,
            jd_text=session.jd_text,
            resume_text=session.resume_text,
            memory_context=memory,
            mode=session.mode,  # type: ignore[arg-type]
        )
        finish_run(db, interview_run, review.model_dump(exclude={"evaluation"}))

    async with traced_run(
        db,
        ctx,
        agent_name="evaluation",
        task_type="interview_review",
        input_data={"agent": "interview"},
    ) as eval_run:
        evaluation = await EvaluationAgent().evaluate_interview_review(
            review,
            transcript=transcript,
            resume_text=session.resume_text,
            jd_text=session.jd_text,
        )
        finish_run(db, eval_run, evaluation.model_dump())

    # If evaluation flags parse-failure style content, replace with transcript fallback
    from app.agents.interview.agent import _fallback_review_from_transcript, _is_failed_review

    review_blob = json.dumps(review.model_dump(exclude={"evaluation"}), ensure_ascii=False)
    eval_blob = json.dumps(evaluation.model_dump(), ensure_ascii=False)
    if (
        _is_failed_review(review)
        or "解析失败" in review_blob
        or "解析失败" in eval_blob
        or "请重新生成复盘" in review_blob
    ):
        review = _fallback_review_from_transcript(transcript, position=session.position)
        evaluation = EvaluationResult(
            risk_level="low",
            score=review.overall_score,
            problems=[],
            suggestions=["基于本轮对话生成的可读复盘（已替换异常结构化输出）"],
            fabricated_claims=[],
        )

    review.evaluation = evaluation.model_dump()
    save_evaluation_record(
        db,
        agent_name="interview",
        task_type="review",
        evaluation=evaluation,
        input_data={"session_id": str(session.id), "turns": len(transcript)},
        output_data=review.model_dump(exclude={"evaluation"}),
        user_id=session.user_id,
        conversation_id=session.conversation_id,
        trace_id=ctx.trace_id,
    )
    session.review_json = review.model_dump(exclude={"evaluation"})
    session.evaluation_json = evaluation.model_dump()
    session.status = "completed"
    session.stage = "END"
    session.updated_at = datetime.utcnow()

    record_interview_completed(
        db,
        session.user_id,
        overall_score=review.overall_score,
        strengths=review.strengths,
        weaknesses=review.weaknesses,
    )
    return review
