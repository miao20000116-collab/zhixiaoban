"""Voice interview orchestration: ASR → Interview → Evaluation → expression analysis."""

from __future__ import annotations

import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from app.agents.evaluation.agent import EvaluationAgent
from app.models.interview_audio import InterviewAudio
from app.models.interview_session import InterviewSession
from app.services.expression_analysis import analyze_expression
from app.services.interview_service import (
    format_review_markdown,
    format_turn_markdown,
    start_interview,
    submit_answer,
)
from app.services.recommendation import format_recommendation_markdown, recommend_after_interview
from app.services.speech import save_audio_bytes, synthesize_speech, transcribe_audio


async def start_voice_interview(
    db: Session,
    *,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID | None = None,
    position: str | None = None,
    jd_text: str | None = None,
    mode: str = "full",
    with_tts: bool = True,
) -> dict:
    """Start voice interview.

    quick=True keeps the first question fast (no bank/first-question LLM);
    with_tts=True uses server CosyVoice audio instead of browser speechSynthesis.
    """
    session, turn, markdown = await start_interview(
        db,
        user_id=user_id,
        conversation_id=conversation_id,
        position=position,
        jd_text=jd_text,
        mode=mode,  # type: ignore[arg-type]
        quick=True,
    )

    tts_url = None
    if with_tts and turn.question:
        try:
            _, tts_url = await synthesize_speech(turn.question)
            db.add(
                InterviewAudio(
                    session_id=session.id,
                    user_id=user_id,
                    role="assistant",
                    audio_url=tts_url,
                    transcript=turn.question,
                    question_text=turn.question,
                )
            )
            db.commit()
        except Exception:  # noqa: BLE001 — TTS optional
            tts_url = None

    return {
        "session": session,
        "turn": turn,
        "markdown": markdown,
        "tts_url": tts_url,
    }


async def submit_voice_answer(
    db: Session,
    *,
    session: InterviewSession,
    audio_bytes: bytes,
    filename: str = "answer.webm",
    duration_ms: int | None = None,
    transcript_override: str | None = None,
    with_tts: bool = True,
    fast: bool = True,
) -> dict:
    """Voice pipeline for one user answer.

    fast=True (default for phone UX): ASR → interview next turn → TTS.
    Skips per-turn EvaluationAgent LLM scoring to cut latency; full scoring
    still happens in the final review path inside submit_answer.
    """
    transcript = (transcript_override or "").strip()
    if not transcript and not audio_bytes:
        raise ValueError("语音回答缺少音频或转写文本")

    if audio_bytes:
        saved_name, audio_url = save_audio_bytes(audio_bytes, suffix=Path(filename).suffix or ".webm")
    else:
        # Realtime path: browser live ASR already produced text — skip upload/SenseVoice wait.
        saved_name = "live-asr"
        audio_url = "realtime://live-asr"

    if not transcript:
        try:
            transcript = await transcribe_audio(audio_bytes, filename=filename)
        except Exception as exc:  # noqa: BLE001 — surface ASR failures clearly
            hint = str(exc).strip() or exc.__class__.__name__
            raise ValueError(f"语音识别失败，请靠近麦克风再说一次（{hint}）") from exc
        transcript = transcript.strip()
        if not transcript:
            raise ValueError("没有识别到有效语音，请再说一次")

    expression = analyze_expression(transcript, duration_ms=duration_ms)

    # Find last assistant question for scoring context
    question_text = None
    for turn in reversed(session.turns_json or []):
        if turn.get("role") == "assistant" and turn.get("content"):
            question_text = turn["content"]
            break

    answer_score = None
    if not fast:
        try:
            scores = await EvaluationAgent().evaluate_interview_answer(
                question=question_text or "请介绍你自己",
                answer=transcript,
                position=session.position,
                jd_text=session.jd_text,
                resume_text=session.resume_text,
            )
            answer_score = scores.model_dump()
        except Exception:  # noqa: BLE001
            answer_score = None

    audio_row = InterviewAudio(
        session_id=session.id,
        user_id=session.user_id,
        role="user",
        audio_url=audio_url,
        transcript=transcript,
        duration_ms=duration_ms,
        question_text=question_text,
        analysis=expression,
        answer_score=answer_score,
    )
    db.add(audio_row)
    db.commit()
    db.refresh(audio_row)

    session, turn, review, markdown = await submit_answer(
        db, session=session, user_message=transcript
    )

    # Enrich markdown with transcript + expression + score
    extra_lines = [
        "",
        "## 语音逐字稿",
        transcript,
        "",
        "## 表达分析",
        f"- 语速：{expression.get('speech_rate_cpm') or '未知'} 字/分钟",
        f"- 流畅度：{expression.get('fluency_score')}/100",
        f"- 口头禅次数：{expression.get('filler_count')}",
        f"- 停顿密度：{expression.get('pause_density')}",
    ]
    if expression.get("suggestions"):
        extra_lines.append("- 建议：")
        extra_lines.extend([f"  - {s}" for s in expression["suggestions"]])
    if answer_score:
        extra_lines.extend(
            [
                "",
                "## 回答评分",
                f"- 综合：{answer_score.get('overall')}",
                f"- 问题理解：{answer_score.get('understanding')} · 结构：{answer_score.get('structure')}",
                f"- 专业：{answer_score.get('expertise')} · 岗位匹配：{answer_score.get('job_match')}",
                f"- 真实性：{answer_score.get('authenticity')}",
            ]
        )
        for c in answer_score.get("comments") or []:
            extra_lines.append(f"- {c}")

    next_action = None
    if review:
        next_action = recommend_after_interview(
            weaknesses=review.weaknesses,
            overall_score=review.overall_score,
        )
        markdown = format_review_markdown(session, review) + "\n".join(extra_lines)
        markdown += format_recommendation_markdown(next_action)
    else:
        # Insert expression block before interviewer next question section end
        markdown = format_turn_markdown(session, turn) + "\n".join(extra_lines)

    tts_url = None
    if with_tts and turn.question and not (review and turn.interview_complete):
        try:
            _, tts_url = await synthesize_speech(turn.question)
            db.add(
                InterviewAudio(
                    session_id=session.id,
                    user_id=session.user_id,
                    role="assistant",
                    audio_url=tts_url,
                    transcript=turn.question,
                    question_text=turn.question,
                )
            )
            db.commit()
        except Exception:  # noqa: BLE001 — TTS optional
            tts_url = None

    return {
        "session": session,
        "turn": turn,
        "review": review,
        "markdown": markdown,
        "transcript": transcript,
        "audio_url": audio_url,
        "audio_id": audio_row.id,
        "expression": expression,
        "answer_score": answer_score,
        "tts_url": tts_url,
        "next_action": next_action,
        "filename": saved_name,
    }


def list_session_audios(db: Session, session_id: uuid.UUID) -> list[InterviewAudio]:
    return (
        db.query(InterviewAudio)
        .filter(InterviewAudio.session_id == session_id)
        .order_by(InterviewAudio.created_at.asc())
        .all()
    )


def build_full_transcript(db: Session, session_id: uuid.UUID) -> str:
    rows = list_session_audios(db, session_id)
    lines: list[str] = []
    for row in rows:
        role = "面试官" if row.role == "assistant" else "候选人"
        if row.transcript:
            lines.append(f"{role}：{row.transcript}")
    if not lines:
        session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
        for t in (session.turns_json if session else None) or []:
            role = "面试官" if t.get("role") == "assistant" else "候选人"
            lines.append(f"{role}：{t.get('content', '')}")
    return "\n".join(lines)
