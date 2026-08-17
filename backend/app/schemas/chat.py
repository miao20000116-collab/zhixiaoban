"""Chat API schemas."""

import uuid

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    conversation_id: uuid.UUID
    message: str = Field(min_length=1)


class ChatDoneEvent(BaseModel):
    message_id: uuid.UUID
