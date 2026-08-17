"""Master Agent output schema."""

from pydantic import BaseModel, Field


class MasterAgentResult(BaseModel):
    intent: str = Field(description="Detected user intent")
    confidence: float = Field(ge=0, le=1)
    need_agent: str | None = Field(default=None, description="Agent to invoke, null for general_chat")


INTENT_AGENT_MAP: dict[str, str | None] = {
    "resume": "resume_agent",
    "jd_analysis": "job_agent",
    "interview": "interview_agent",
    "career_consult": "career_agent",
    "memory_update": "memory_agent",
    "general_chat": None,
}
