"""Interview API schemas."""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class InterviewStartRequest(BaseModel):
    conversation_id: uuid.UUID | None = None
    position: str | None = None
    jd_text: str | None = None
    resume_text: str | None = None
    mode: Literal["full", "technical_interview"] = "full"


class InterviewAnswerRequest(BaseModel):
    message: str = Field(min_length=1)


class InterviewQuestionsRequest(BaseModel):
    position: str | None = None
    jd_text: str | None = None
    resume_text: str | None = None
    mode: Literal["full", "technical_interview"] = "full"


class InterviewSessionResponse(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID | None = None
    mode: str
    stage: str
    status: str
    position: str | None = None
    turns_in_stage: int = 0
    turn: dict[str, Any] | None = None
    review: dict[str, Any] | None = None
    evaluation: dict[str, Any] | None = None
    markdown: str
    created_at: datetime
    updated_at: datetime


class InterviewQuestionsResponse(BaseModel):
    questions: dict[str, Any]
    markdown: str
