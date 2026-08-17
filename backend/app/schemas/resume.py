"""Resume API schemas."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ResumeParseRequest(BaseModel):
    resume_text: str = Field(min_length=20)
    conversation_id: uuid.UUID | None = None
    sync_memory: bool = True


class ResumeDiagnoseRequest(BaseModel):
    resume_text: str = Field(min_length=20)
    target_position: str | None = None
    jd_text: str | None = None
    conversation_id: uuid.UUID | None = None


class ResumeStarRequest(BaseModel):
    project_text: str | None = None
    resume_text: str | None = None
    conversation_id: uuid.UUID | None = None


class ResumeOptimizeRequest(BaseModel):
    resume_text: str = Field(min_length=20)
    target_position: str | None = None
    jd_text: str | None = None
    conversation_id: uuid.UUID | None = None
    sync_memory: bool = True


class ResumeTaskResponse(BaseModel):
    id: uuid.UUID
    task_type: str
    result: dict[str, Any]
    evaluation: dict[str, Any] | None = None
    markdown: str
    created_at: datetime


class ResumeVersionListItem(BaseModel):
    id: uuid.UUID
    task_type: str
    target_position: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
