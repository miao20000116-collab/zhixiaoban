"""Memory Agent extraction schema."""

from typing import Any, Literal

from pydantic import BaseModel, Field

ExtractionType = Literal[
    "profile",
    "experience",
    "project",
    "skill",
    "career_goal",
    "fact_memory",
    "skill_memory",
    "goal_memory",
    "gap_memory",
    "progress_memory",
    "constraint_memory",
]


class MemoryExtraction(BaseModel):
    type: ExtractionType
    importance_score: int = Field(ge=1, le=10)
    data: dict[str, Any]


class MemoryExtractionResult(BaseModel):
    extractions: list[MemoryExtraction] = Field(default_factory=list)
