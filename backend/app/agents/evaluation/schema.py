"""Evaluation Agent output schemas."""

from typing import Literal

from pydantic import BaseModel, Field


class EvaluationIssue(BaseModel):
    issue: str
    suggestion: str | None = None
    severity: Literal["low", "medium", "high"] = "medium"


class EvaluationResult(BaseModel):
    risk_level: Literal["low", "medium", "high"] = "low"
    score: int = Field(ge=0, le=100, default=100)
    problems: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    fabricated_claims: list[str] = Field(default_factory=list)
    issues: list[EvaluationIssue] = Field(default_factory=list)
    job_match_score: int | None = Field(default=None, ge=0, le=100)
    job_match_notes: list[str] = Field(default_factory=list)


class InterviewAnswerScores(BaseModel):
    """Weighted interview answer quality dimensions."""

    understanding: int = Field(ge=0, le=100, default=70)  # 20%
    structure: int = Field(ge=0, le=100, default=70)  # 20%
    expertise: int = Field(ge=0, le=100, default=70)  # 30%
    job_match: int = Field(ge=0, le=100, default=70)  # 20%
    authenticity: int = Field(ge=0, le=100, default=70)  # 10%
    overall: int = Field(ge=0, le=100, default=70)
    comments: list[str] = Field(default_factory=list)

    def compute_overall(self) -> int:
        weighted = (
            self.understanding * 0.20
            + self.structure * 0.20
            + self.expertise * 0.30
            + self.job_match * 0.20
            + self.authenticity * 0.10
        )
        return int(round(weighted))
