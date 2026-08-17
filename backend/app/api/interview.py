"""Interview Agent REST API."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.agents.interview.schema import InterviewReviewResult
from app.database.connection import get_db
from app.models.conversation import Conversation
from app.models.interview_session import InterviewSession
from app.models.message import Message
from app.schemas.interview import (
    InterviewAnswerRequest,
    InterviewQuestionsRequest,
    InterviewQuestionsResponse,
    InterviewSessionResponse,
    InterviewStartRequest,
)
from app.services.dev_user import get_or_create_dev_user
from app.services.interview_service import (
    end_interview,
    format_question_bank_markdown,
    format_review_markdown,
    generate_question_bank,
    get_active_session,
    start_interview,
    submit_answer,
)
from app.services.recommendation import persist_next_action, recommend_after_interview
from app.services.task_memory_service import create_or_update_task

router = APIRouter(prefix="/interview", tags=["interview"])


def _append_messages(
    db: Session,
    *,
    conversation_id: uuid.UUID | None,
    user_id: uuid.UUID,
    user_note: str | None,
    markdown: str,
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


def _to_response(
    session: InterviewSession,
    *,
    markdown: str,
    turn: dict | None = None,
    review: dict | None = None,
) -> InterviewSessionResponse:
    return InterviewSessionResponse(
        id=session.id,
        conversation_id=session.conversation_id,
        mode=session.mode,
        stage=session.stage,
        status=session.status,
        position=session.position,
        turns_in_stage=session.turns_in_stage or 0,
        turn=turn,
        review=review or session.review_json,
        evaluation=session.evaluation_json,
        markdown=markdown,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.post("/start", response_model=InterviewSessionResponse)
async def api_start_interview(body: InterviewStartRequest, db: Session = Depends(get_db)) -> InterviewSessionResponse:
    user = get_or_create_dev_user(db)
    try:
        session, turn, markdown = await start_interview(
            db,
            user_id=user.id,
            conversation_id=body.conversation_id,
            position=body.position,
            jd_text=body.jd_text,
            resume_text=body.resume_text,
            mode=body.mode,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"开始面试失败: {exc}") from exc

    _append_messages(
        db,
        conversation_id=body.conversation_id,
        user_id=user.id,
        user_note=f"【开始模拟面试】模式={body.mode} 岗位={body.position or '未指定'}",
        markdown=markdown,
    )
    create_or_update_task(
        db,
        user.id,
        goal=f"准备{body.position or '目标岗位'}模拟面试",
        task_type="interview_prepare",
        conversation_id=body.conversation_id,
        completed_step="JD对齐" if body.jd_text else None,
        next_action="完成本轮模拟面试并生成复盘",
        meta={"interview_session_id": str(session.id)},
    )
    return _to_response(session, markdown=markdown, turn=turn.model_dump())


@router.post("/questions", response_model=InterviewQuestionsResponse)
async def api_questions(body: InterviewQuestionsRequest, db: Session = Depends(get_db)) -> InterviewQuestionsResponse:
    user = get_or_create_dev_user(db)
    try:
        bank = await generate_question_bank(
            db,
            user_id=user.id,
            position=body.position,
            jd_text=body.jd_text,
            resume_text=body.resume_text,
            mode=body.mode,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"生成题库失败: {exc}") from exc
    return InterviewQuestionsResponse(questions=bank.model_dump(), markdown=format_question_bank_markdown(bank))


@router.get("/active", response_model=InterviewSessionResponse | None)
def api_active(
    conversation_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
) -> InterviewSessionResponse | None:
    user = get_or_create_dev_user(db)
    session = get_active_session(db, user_id=user.id, conversation_id=conversation_id)
    if session is None:
        return None
    return _to_response(
        session,
        markdown=f"进行中的面试 · 阶段 {session.stage}",
        turn=None,
    )


@router.post("/{session_id}/answer", response_model=InterviewSessionResponse)
async def api_answer(
    session_id: uuid.UUID,
    body: InterviewAnswerRequest,
    db: Session = Depends(get_db),
) -> InterviewSessionResponse:
    user = get_or_create_dev_user(db)
    session = (
        db.query(InterviewSession)
        .filter(InterviewSession.id == session_id, InterviewSession.user_id == user.id)
        .first()
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Interview session not found")
    if session.status != "active":
        raise HTTPException(status_code=400, detail="面试已结束，请重新开始")

    try:
        session, turn, review, markdown = await submit_answer(db, session=session, user_message=body.message)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"面试回合失败: {exc}") from exc

    _append_messages(
        db,
        conversation_id=session.conversation_id,
        user_id=user.id,
        user_note=body.message,
        markdown=markdown,
    )
    if review:
        next_action = recommend_after_interview(
            weaknesses=review.weaknesses,
            overall_score=review.overall_score,
        )
        persist_next_action(db, user.id, next_action, conversation_id=session.conversation_id)
        create_or_update_task(
            db,
            user.id,
            goal=f"复盘{session.position or '目标岗位'}模拟面试",
            task_type="interview_prepare",
            conversation_id=session.conversation_id,
            completed_step="模拟面试",
            next_action=next_action.get("message"),
            meta={"interview_session_id": str(session.id)},
        )
    return _to_response(
        session,
        markdown=markdown,
        turn=turn.model_dump(),
        review=review.model_dump() if review else None,
    )


@router.post("/{session_id}/end", response_model=InterviewSessionResponse)
async def api_end(session_id: uuid.UUID, db: Session = Depends(get_db)) -> InterviewSessionResponse:
    user = get_or_create_dev_user(db)
    session = (
        db.query(InterviewSession)
        .filter(InterviewSession.id == session_id, InterviewSession.user_id == user.id)
        .first()
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Interview session not found")

    try:
        session, review, markdown = await end_interview(db, session=session)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"结束面试失败: {exc}") from exc

    _append_messages(
        db,
        conversation_id=session.conversation_id,
        user_id=user.id,
        user_note="【结束面试 / 请求复盘】",
        markdown=markdown,
    )
    next_action = recommend_after_interview(
        weaknesses=review.weaknesses,
        overall_score=review.overall_score,
    )
    persist_next_action(db, user.id, next_action, conversation_id=session.conversation_id)
    create_or_update_task(
        db,
        user.id,
        goal=f"复盘{session.position or '目标岗位'}模拟面试",
        task_type="interview_prepare",
        conversation_id=session.conversation_id,
        completed_step="模拟面试",
        next_action=next_action.get("message"),
        meta={"interview_session_id": str(session.id)},
    )
    return _to_response(session, markdown=markdown, review=review.model_dump())


@router.get("/{session_id}", response_model=InterviewSessionResponse)
def api_get_session(session_id: uuid.UUID, db: Session = Depends(get_db)) -> InterviewSessionResponse:
    user = get_or_create_dev_user(db)
    session = (
        db.query(InterviewSession)
        .filter(InterviewSession.id == session_id, InterviewSession.user_id == user.id)
        .first()
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Interview session not found")

    if session.review_json:
        review = InterviewReviewResult.model_validate(
            {**session.review_json, "evaluation": session.evaluation_json}
        )
        markdown = format_review_markdown(session, review)
    else:
        markdown = f"面试会话 {session.id} · {session.stage} · {session.status}"
    return _to_response(session, markdown=markdown, review=session.review_json)
