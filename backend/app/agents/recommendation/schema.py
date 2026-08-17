"""Recommendation Agent schemas — actionable plans with why/sources/priority."""

from typing import Any

from pydantic import BaseModel, Field


class PlanStep(BaseModel):
    step: str
    reason: str = ""
    source: str = ""
    priority: str = "medium"


class RecommendationItem(BaseModel):
    action: str
    why: str = ""
    sources: list[dict[str, str]] = Field(default_factory=list)
    priority: str = "medium"  # high | medium | low


class RecommendationPlan(BaseModel):
    goal: str = ""
    plan: list[PlanStep] = Field(default_factory=list)
    recommendations: list[RecommendationItem] = Field(default_factory=list)
    primary_action: str | None = None
    summary: str | None = None
    evaluation: dict[str, Any] | None = None
