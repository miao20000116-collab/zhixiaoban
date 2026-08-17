"""Voice interview + career status REST APIs."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.models.conversation import Conversation
from app.models.message import Message
from app.schemas.interview import InterviewSessionResponse, InterviewStartRequest
from app.services.career_status_service import (
    refresh_career_status_from_history,
    status_to_dict,
)
from app.services.dev_user import get_or_create_dev_user
from app.services.conversation_service import (
    maybe_update_title_from_first_message,
    refresh_conversation_title_with_intent,
    update_conversation_summary,
)
from app.services.interview_service import get_active_session
from app.services.speech import synthesize_speech
from app.services.voice_interview_service import (
    build_full_transcript,
    list_session_audios,
    start_voice_interview,
    submit_voice_answer,
)

router = APIRouter(tags=["voice-career"])


def _http_error(prefix: str, exc: Exception, *, status: int = 500) -> HTTPException:
    detail = str(exc).strip() or exc.__class__.__name__
    return HTTPException(status_code=status, detail=f"{prefix}: {detail}")


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class VoiceAnswerResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    stage: str
    status: str
    transcript: str
    audio_url: str
    expression: dict[str, Any]
    answer_score: dict[str, Any] | None = None
    tts_url: str | None = None
    question: str | None = None
    markdown: str
    next_action: dict[str, Any] | None = None
    review: dict[str, Any] | None = None
    evaluation: dict[str, Any] | None = None


def _append_messages(
    db: Session,
    *,
    conversation_id: uuid.UUID | None,
    user_id: uuid.UUID,
    user_note: str | None,
    markdown: str,
    intent: str | None = None,
) -> None:
    if conversation_id is None:
        return
    conversation = (
        db.query(Conversation)
        .filter(Conversation.id == conversation_id, Conversation.user_id == user_id)
        .first()
    )
    if conversation is None:
        return
    if user_note:
        db.add(Message(conversation_id=conversation_id, role="user", content=user_note))
    db.add(Message(conversation_id=conversation_id, role="assistant", content=markdown))
    conversation.updated_at = datetime.utcnow()
    db.commit()

    if user_note:
        maybe_update_title_from_first_message(
            db, conversation, user_note, intent=intent or "interview"
        )
        refresh_conversation_title_with_intent(
            db, conversation, user_note, intent or "interview"
        )
        update_conversation_summary(
            db,
            conversation,
            user_message=user_note,
            assistant_content=markdown,
            intent=intent or "interview",
        )


@router.post("/interview/voice/start", response_model=InterviewSessionResponse)
async def api_voice_start(body: InterviewStartRequest, db: Session = Depends(get_db)) -> InterviewSessionResponse:
    user = get_or_create_dev_user(db)
    try:
        result = await start_voice_interview(
            db,
            user_id=user.id,
            conversation_id=body.conversation_id,
            position=body.position,
            jd_text=body.jd_text,
            mode=body.mode,
            with_tts=True,
        )
    except Exception as exc:
        raise _http_error("语音面试启动失败", exc) from exc

    session = result["session"]
    turn = result["turn"]
    markdown = result["markdown"]
    if result.get("tts_url"):
        markdown += f"\n\n_面试官语音：{result['tts_url']}_"

    _append_messages(
        db,
        conversation_id=body.conversation_id,
        user_id=user.id,
        user_note="开始语音模拟面试",
        markdown=markdown,
        intent="interview",
    )

    return InterviewSessionResponse(
        id=session.id,
        conversation_id=session.conversation_id,
        mode=session.mode,
        stage=session.stage,
        status=session.status,
        position=session.position,
        turns_in_stage=session.turns_in_stage or 0,
        turn={**turn.model_dump(), "tts_url": result.get("tts_url")},
        review=None,
        evaluation=None,
        markdown=markdown,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.post("/interview/voice/{session_id}/answer", response_model=VoiceAnswerResponse)
async def api_voice_answer(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    file: UploadFile | None = File(default=None),
    duration_ms: int | None = Form(default=None),
    transcript: str | None = Form(default=None),
    fast: str = Form(default="true"),
) -> VoiceAnswerResponse:
    user = get_or_create_dev_user(db)
    session = get_active_session(db, user_id=user.id, session_id=session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="面试会话不存在或已结束")

    data = await file.read() if file is not None else b""
    text = (transcript or "").strip()
    if not data and not text:
        raise HTTPException(status_code=400, detail="请提供音频或实时转写文本")

    fast_mode = str(fast).strip().lower() not in {"0", "false", "no"}

    try:
        result = await submit_voice_answer(
            db,
            session=session,
            audio_bytes=data,
            filename=(file.filename if file is not None else None) or "answer.webm",
            duration_ms=duration_ms,
            transcript_override=text or None,
            with_tts=True,
            fast=fast_mode,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise _http_error("语音回答处理失败", exc) from exc

    sess = result["session"]
    review = result.get("review")
    _append_messages(
        db,
        conversation_id=sess.conversation_id,
        user_id=user.id,
        user_note=f"[语音回答] {result['transcript']}",
        markdown=result["markdown"],
        intent="interview",
    )

    return VoiceAnswerResponse(
        id=result["audio_id"],
        session_id=sess.id,
        stage=sess.stage,
        status=sess.status,
        transcript=result["transcript"],
        audio_url=result["audio_url"],
        expression=result["expression"],
        answer_score=result.get("answer_score"),
        tts_url=result.get("tts_url"),
        question=(result.get("turn").question if result.get("turn") else None),
        markdown=result["markdown"],
        next_action=result.get("next_action"),
        review=review.model_dump(exclude={"evaluation"}) if review else None,
        evaluation=review.evaluation if review else sess.evaluation_json,
    )


@router.get("/interview/{session_id}/transcript")
def api_session_transcript(session_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    text = build_full_transcript(db, session_id)
    audios = list_session_audios(db, session_id)
    return {
        "session_id": str(session_id),
        "transcript": text,
        "clips": [
            {
                "id": str(a.id),
                "role": a.role,
                "audio_url": a.audio_url,
                "transcript": a.transcript,
                "analysis": a.analysis,
                "answer_score": a.answer_score,
                "duration_ms": a.duration_ms,
            }
            for a in audios
        ],
    }


@router.post("/speech/tts")
async def api_tts(body: TTSRequest) -> dict:
    try:
        filename, url = await synthesize_speech(body.text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"TTS 失败: {exc}") from exc
    return {"filename": filename, "url": url}


@router.get("/career/status")
def api_career_status(db: Session = Depends(get_db)) -> dict:
    user = get_or_create_dev_user(db)
    status = refresh_career_status_from_history(db, user.id)
    return status_to_dict(status)


@router.post("/career/status/refresh")
def api_refresh_career_status(db: Session = Depends(get_db)) -> dict:
    user = get_or_create_dev_user(db)
    status = refresh_career_status_from_history(db, user.id)
    return status_to_dict(status)
