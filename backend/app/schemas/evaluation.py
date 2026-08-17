"""Pydantic schemas for Evaluation QC APIs."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class EvaluationRecordItem(BaseModel):
    id: UUID
    agent_name: str
    task_type: str
    score: int | None = None
    risk_level: str
    feedback: dict[str, Any] | None = None
    trace_id: UUID | None = None
    created_at: datetime


class BadCaseItem(BaseModel):
    id: UUID
    agent_name: str
    problem_type: str
    description: str
    solution: str | None = None
    status: str
    evaluation_record_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


class BadCaseUpdateRequest(BaseModel):
    status: str | None = None
    solution: str | None = None


class BadCaseCreateRequest(BaseModel):
    agent_name: str
    problem_type: str
    description: str
    solution: str | None = None


class PromptTemplateItem(BaseModel):
    id: UUID
    agent_name: str
    version: str
    status: str
    created_at: datetime
    content_preview: str | None = None
    content: str | None = None


class PromptDetailItem(BaseModel):
    id: UUID
    agent_name: str
    version: str
    status: str
    created_at: datetime
    content: str


class PromptCreateRequest(BaseModel):
    agent_name: str
    version: str
    content: str
    activate: bool = False


class TraceRunItem(BaseModel):
    id: UUID
    agent_name: str
    task_type: str | None = None
    status: str
    duration_ms: float | None = None
    parent_run_id: UUID | None = None
    created_at: datetime


class TraceDetailResponse(BaseModel):
    trace_id: UUID
    runs: list[TraceRunItem]


class DatasetInfo(BaseModel):
    id: str
    name: str
    description: str
    case_count: int


class DatasetRunRequest(BaseModel):
    limit: int | None = Field(default=None, ge=1, le=50)


class EvaluateRequest(BaseModel):
    kind: str = "resume"
    source_text: str | None = None
    output: dict[str, Any] | None = None
    analysis: dict[str, Any] | None = None
    review: dict[str, Any] | None = None
    transcript: list[dict[str, str]] | None = None
    jd_text: str | None = None
    target_position: str | None = None
    search_context: str | None = None
    question: str | None = None
    answer: str | None = None
    position: str | None = None
    resume_text: str | None = None
    task: str = "optimize"
    content: str | None = None
    # Career Gap / Recommendation manual checks
    gap: dict[str, Any] | None = None
    plan: dict[str, Any] | None = None
    memory_context: str | None = None
    target_jd: str | None = None
    gap_context: str | None = None
    task_context: str | None = None
