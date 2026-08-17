"""Career profile API schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CareerProfileResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    target_position: str | None
    industry: str | None = Field(validation_alias="target_industry")
    summary: str | None = Field(validation_alias="career_summary")
    experience_year: int | None
    confidence_score: float | None
    updated_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class CareerProfileUpdate(BaseModel):
    target_position: str | None = None
    industry: str | None = None
    summary: str | None = None
    experience_year: int | None = None


class ExperienceResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    company: str | None
    position: str | None
    responsibility: str | None
    achievement: str | None
    source: str | None
    confidence: float | None

    model_config = {"from_attributes": True}


class ExperienceUpdate(BaseModel):
    company: str | None = None
    position: str | None = None
    responsibility: str | None = None
    achievement: str | None = None


class ProjectResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    project_name: str | None
    background: str | None
    action: str | None
    result: str | None
    source: str | None
    confidence: float | None

    model_config = {"from_attributes": True}


class ProjectUpdate(BaseModel):
    project_name: str | None = None
    background: str | None = None
    action: str | None = None
    result: str | None = None


class SkillResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    skill_name: str
    level: int | None
    source: str | None
    confidence: float | None

    model_config = {"from_attributes": True}


class SkillUpdate(BaseModel):
    skill_name: str | None = None
    level: int | None = Field(default=None, ge=1, le=10)


class FullProfileResponse(BaseModel):
    profile: CareerProfileResponse | None
    experiences: list[ExperienceResponse]
    projects: list[ProjectResponse]
    skills: list[SkillResponse]
