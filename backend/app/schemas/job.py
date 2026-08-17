"""Job Intelligence API schemas."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class JobAnalyzeRequest(BaseModel):
    jd_text: str | None = None
    position: str | None = None
    company: str | None = None
    conversation_id: uuid.UUID | None = None


class JobAnalyzeResponse(BaseModel):
    id: uuid.UUID
    analysis: dict[str, Any]
    evaluation: dict[str, Any] | None = None
    career_gap: dict[str, Any] | None = None
    markdown: str
    created_at: datetime


class JobAnalysisListItem(BaseModel):
    id: uuid.UUID
    position: str | None = None
    company: str | None = None
    input_type: str
    created_at: datetime

    model_config = {"from_attributes": True}
