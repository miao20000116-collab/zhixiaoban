"""Conversation REST API."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.schemas.conversation import (
    ConversationCreate,
    ConversationResponse,
    ConversationUpdate,
    MessageResponse,
)
from app.services import conversation_service

router = APIRouter(tags=["conversation"])


@router.post("/conversation", response_model=ConversationResponse)
def create_conversation(
    body: ConversationCreate,
    db: Session = Depends(get_db),
) -> ConversationResponse:
    title = body.title or "新对话"
    conversation = conversation_service.create_conversation(db, title=title)
    return ConversationResponse.model_validate(conversation)


@router.get("/conversation", response_model=list[ConversationResponse])
def list_conversations(db: Session = Depends(get_db)) -> list[ConversationResponse]:
    conversations = conversation_service.list_conversations(db)
    return [ConversationResponse.model_validate(c) for c in conversations]


@router.get("/conversation/{conversation_id}", response_model=ConversationResponse)
def get_conversation(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> ConversationResponse:
    try:
        conversation = conversation_service.get_conversation(db, conversation_id)
    except conversation_service.ConversationNotFoundError:
        raise HTTPException(status_code=404, detail="Conversation not found") from None
    return ConversationResponse.model_validate(conversation)


@router.get("/conversation/{conversation_id}/messages", response_model=list[MessageResponse])
def list_messages(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> list[MessageResponse]:
    try:
        messages = conversation_service.list_messages(db, conversation_id)
    except conversation_service.ConversationNotFoundError:
        raise HTTPException(status_code=404, detail="Conversation not found") from None
    return [MessageResponse.model_validate(m) for m in messages]


@router.patch("/conversation/{conversation_id}", response_model=ConversationResponse)
def update_conversation(
    conversation_id: uuid.UUID,
    body: ConversationUpdate,
    db: Session = Depends(get_db),
) -> ConversationResponse:
    try:
        conversation = conversation_service.update_conversation_title(db, conversation_id, body.title)
    except conversation_service.ConversationNotFoundError:
        raise HTTPException(status_code=404, detail="Conversation not found") from None
    return ConversationResponse.model_validate(conversation)


@router.delete("/conversation/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> None:
    try:
        conversation_service.delete_conversation(db, conversation_id)
    except conversation_service.ConversationNotFoundError:
        raise HTTPException(status_code=404, detail="Conversation not found") from None
