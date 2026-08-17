"""Chat SSE streaming API."""

import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal, get_db
from app.schemas.chat import ChatRequest
from app.services import chat_service, conversation_service

router = APIRouter(tags=["chat"])


@router.post("/chat")
async def send_message(
    body: ChatRequest,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    try:
        conversation_service.get_conversation(db, body.conversation_id)
    except conversation_service.ConversationNotFoundError:
        raise HTTPException(status_code=404, detail="Conversation not found") from None

    async def event_stream():
        stream_db = SessionLocal()
        try:
            async for event_type, payload in chat_service.stream_chat_response(
                stream_db, body.conversation_id, body.message
            ):
                if event_type == "intent":
                    yield f"event: intent\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                elif event_type == "step":
                    yield f"event: step\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                elif event_type == "token":
                    yield f"event: token\ndata: {json.dumps({'content': payload}, ensure_ascii=False)}\n\n"
                elif event_type == "job_analysis":
                    yield f"event: job_analysis\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                elif event_type == "resume_result":
                    yield f"event: resume_result\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                elif event_type == "interview_turn":
                    yield f"event: interview_turn\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                elif event_type == "interview_review":
                    yield f"event: interview_review\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                elif event_type == "interview_questions":
                    yield f"event: interview_questions\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                elif event_type == "next_action":
                    yield f"event: next_action\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                elif event_type == "career_gap":
                    yield f"event: career_gap\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                elif event_type == "task_updated":
                    yield f"event: task_updated\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                elif event_type == "conversation_updated":
                    yield f"event: conversation_updated\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                elif event_type == "done":
                    yield f"event: done\ndata: {json.dumps({'message_id': str(payload)}, ensure_ascii=False)}\n\n"
                elif event_type == "memory_updated":
                    yield f"event: memory_updated\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                elif event_type == "error":
                    yield f"event: error\ndata: {json.dumps({'detail': payload}, ensure_ascii=False)}\n\n"
        finally:
            stream_db.close()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
