"""Career Gap Analysis Agent schemas."""

from typing import Any

from pydantic import BaseModel, Field


class GapEvidence(BaseModel):
    claim: str
    source: str
    source_type: str = "memory"  # memory | experience | project | jd | industry | workflow


class GapItem(BaseModel):
    title: str
    reason: str
    evidence: list[GapEvidence] = Field(default_factory=list)


class StrengthItem(BaseModel):
    title: str
    reason: str = ""
    evidence: list[GapEvidence] = Field(default_factory=list)


class GapRecommendation(BaseModel):
    action: str
    why: str = ""
    priority: str = "medium"  # high | medium | low


class CareerGapResult(BaseModel):
    target_position: str | None = None
    company: str | None = None
    match_score: int = Field(ge=0, le=100, default=0)
    strengths: list[StrengthItem] = Field(default_factory=list)
    gaps: list[GapItem] = Field(default_factory=list)
    recommendations: list[GapRecommendation] = Field(default_factory=list)
    evidence: list[GapEvidence] = Field(default_factory=list)
    summary: str | None = None
    evaluation: dict[str, Any] | None = None
