"""Job Intelligence Agent output schemas."""

from pydantic import BaseModel, Field


class PositionOverview(BaseModel):
    position: str | None = None
    company: str | None = None
    industry: str | None = None
    level: str | None = None
    summary: str | None = None


class UserMatch(BaseModel):
    score: int = Field(ge=0, le=100, default=0)
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)


class CompanyInfo(BaseModel):
    overview: str | None = None
    business: str | None = None
    recent_updates: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    as_of: str | None = None
    is_inferred: bool = False


class IndustryTrend(BaseModel):
    summary: str | None = None
    trends: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    as_of: str | None = None
    is_inferred: bool = False


class JobAnalysisResult(BaseModel):
    position_overview: PositionOverview = Field(default_factory=PositionOverview)
    core_responsibilities: list[str] = Field(default_factory=list)
    required_skills: list[str] = Field(default_factory=list)
    nice_to_have_skills: list[str] = Field(default_factory=list)
    hidden_requirements: list[str] = Field(default_factory=list)
    interview_focus: list[str] = Field(default_factory=list)
    company_analysis: CompanyInfo = Field(default_factory=CompanyInfo)
    industry_trends: IndustryTrend = Field(default_factory=IndustryTrend)
    user_match: UserMatch = Field(default_factory=UserMatch)
    evaluation: dict | None = None
