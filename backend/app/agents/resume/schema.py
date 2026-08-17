"""Resume Agent output schemas."""

from pydantic import BaseModel, Field


class ParsedExperience(BaseModel):
    company: str | None = None
    position: str | None = None
    duration: str | None = None
    responsibility: str | None = None
    achievement: str | None = None


class ParsedProject(BaseModel):
    project_name: str | None = None
    role: str | None = None
    background: str | None = None
    action: str | None = None
    result: str | None = None
    skill_tags: list[str] = Field(default_factory=list)


class ParsedSkill(BaseModel):
    skill_name: str
    level: str | None = None


class ResumeParseResult(BaseModel):
    summary: str | None = None
    target_position: str | None = None
    experiences: list[ParsedExperience] = Field(default_factory=list)
    projects: list[ParsedProject] = Field(default_factory=list)
    skills: list[ParsedSkill] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    raw_notes: list[str] = Field(default_factory=list)


class DiagnosisItem(BaseModel):
    area: str | None = None
    problem: str
    suggestion: str
    severity: str = "medium"  # low | medium | high


class ResumeDiagnosisResult(BaseModel):
    overall_score: int = Field(ge=0, le=100, default=60)
    problems: list[DiagnosisItem] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)


class STARItem(BaseModel):
    project_name: str | None = None
    situation: str | None = None
    task: str | None = None
    action: str | None = None
    result: str | None = None
    bullet: str | None = None
    caveats: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)


class STAROptimizeResult(BaseModel):
    items: list[STARItem] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class ChangeReason(BaseModel):
    original: str | None = None
    revised: str | None = None
    reason: str


class ResumeOptimizeResult(BaseModel):
    target_position: str | None = None
    optimized_resume: str
    change_reasons: list[ChangeReason] = Field(default_factory=list)
    diagnosis: ResumeDiagnosisResult | None = None
    star_projects: list[STARItem] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    evaluation: dict | None = None
