"""Career Profile REST API."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.memory.service import get_full_profile, get_or_create_profile
from app.models.career_gap import CareerGap
from app.models.career_status import CareerStatus
from app.models.career_task import CareerTask
from app.models.experience import Experience
from app.models.project import Project
from app.models.recommendation import Recommendation
from app.models.skill import Skill
from app.schemas.profile import (
    CareerProfileResponse,
    CareerProfileUpdate,
    ExperienceResponse,
    ExperienceUpdate,
    FullProfileResponse,
    ProjectResponse,
    ProjectUpdate,
    SkillResponse,
    SkillUpdate,
)
from app.services.dev_user import get_or_create_dev_user

router = APIRouter(tags=["profile"])


def _profile_to_response(profile) -> CareerProfileResponse:
    return CareerProfileResponse(
        id=profile.id,
        user_id=profile.user_id,
        target_position=profile.target_position,
        industry=profile.target_industry,
        summary=profile.career_summary,
        experience_year=profile.experience_year,
        confidence_score=profile.confidence_score,
        updated_at=profile.updated_at,
    )


@router.get("/profile", response_model=FullProfileResponse)
def get_profile(db: Session = Depends(get_db)) -> FullProfileResponse:
    user = get_or_create_dev_user(db)
    data = get_full_profile(db, user.id)
    profile = data["profile"]
    return FullProfileResponse(
        profile=_profile_to_response(profile) if profile else None,
        experiences=[ExperienceResponse.model_validate(e) for e in data["experiences"]],
        projects=[ProjectResponse.model_validate(p) for p in data["projects"]],
        skills=[SkillResponse.model_validate(s) for s in data["skills"]],
    )


@router.patch("/profile", response_model=CareerProfileResponse)
def update_profile(body: CareerProfileUpdate, db: Session = Depends(get_db)) -> CareerProfileResponse:
    user = get_or_create_dev_user(db)
    profile = get_or_create_profile(db, user.id)
    if body.target_position is not None:
        profile.target_position = body.target_position
    if body.industry is not None:
        profile.target_industry = body.industry
    if body.summary is not None:
        profile.career_summary = body.summary
    if body.experience_year is not None:
        profile.experience_year = body.experience_year
    profile.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(profile)
    return _profile_to_response(profile)


@router.patch("/profile/experiences/{experience_id}", response_model=ExperienceResponse)
def update_experience(
    experience_id: uuid.UUID,
    body: ExperienceUpdate,
    db: Session = Depends(get_db),
) -> ExperienceResponse:
    user = get_or_create_dev_user(db)
    exp = db.query(Experience).filter(Experience.id == experience_id, Experience.user_id == user.id).first()
    if exp is None:
        raise HTTPException(status_code=404, detail="Experience not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(exp, field, value)
    db.commit()
    db.refresh(exp)
    return ExperienceResponse.model_validate(exp)


@router.delete("/profile/experiences/{experience_id}", status_code=204)
def delete_experience(experience_id: uuid.UUID, db: Session = Depends(get_db)) -> None:
    user = get_or_create_dev_user(db)
    exp = db.query(Experience).filter(Experience.id == experience_id, Experience.user_id == user.id).first()
    if exp is None:
        raise HTTPException(status_code=404, detail="Experience not found")
    db.delete(exp)
    db.commit()


@router.patch("/profile/projects/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    db: Session = Depends(get_db),
) -> ProjectResponse:
    user = get_or_create_dev_user(db)
    proj = db.query(Project).filter(Project.id == project_id, Project.user_id == user.id).first()
    if proj is None:
        raise HTTPException(status_code=404, detail="Project not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(proj, field, value)
    db.commit()
    db.refresh(proj)
    return ProjectResponse.model_validate(proj)


@router.delete("/profile/projects/{project_id}", status_code=204)
def delete_project(project_id: uuid.UUID, db: Session = Depends(get_db)) -> None:
    user = get_or_create_dev_user(db)
    proj = db.query(Project).filter(Project.id == project_id, Project.user_id == user.id).first()
    if proj is None:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(proj)
    db.commit()


@router.patch("/profile/skills/{skill_id}", response_model=SkillResponse)
def update_skill(
    skill_id: uuid.UUID,
    body: SkillUpdate,
    db: Session = Depends(get_db),
) -> SkillResponse:
    user = get_or_create_dev_user(db)
    skill = db.query(Skill).filter(Skill.id == skill_id, Skill.user_id == user.id).first()
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(skill, field, value)
    db.commit()
    db.refresh(skill)
    return SkillResponse.model_validate(skill)


@router.delete("/profile/skills/{skill_id}", status_code=204)
def delete_skill(skill_id: uuid.UUID, db: Session = Depends(get_db)) -> None:
    user = get_or_create_dev_user(db)
    skill = db.query(Skill).filter(Skill.id == skill_id, Skill.user_id == user.id).first()
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    db.delete(skill)
    db.commit()

@router.post("/profile/reset")
def reset_profile(db: Session = Depends(get_db)) -> dict:
    """Clear Career Memory for the current guest user (no-login product).

    Used for demos so previous facts do not pollute the next walkthrough.
    Does not delete conversations or messages.
    """
    user = get_or_create_dev_user(db)
    uid = user.id

    db.query(Experience).filter(Experience.user_id == uid).delete(synchronize_session=False)
    db.query(Project).filter(Project.user_id == uid).delete(synchronize_session=False)
    db.query(Skill).filter(Skill.user_id == uid).delete(synchronize_session=False)
    db.query(CareerGap).filter(CareerGap.user_id == uid).delete(synchronize_session=False)
    db.query(Recommendation).filter(Recommendation.user_id == uid).delete(synchronize_session=False)
    db.query(CareerTask).filter(CareerTask.user_id == uid).delete(synchronize_session=False)

    status = db.query(CareerStatus).filter(CareerStatus.user_id == uid).first()
    if status:
        status.stage = "exploring"
        status.interview_count = 0
        status.application_count = 0
        status.strength = None
        status.weakness = None
        status.mood_signals = None
        status.recent_failures = 0
        status.last_interview_score = None
        status.focus_areas = None
        status.next_action = None
        status.latest_gap = None
        status.updated_at = datetime.utcnow()

    profile = get_or_create_profile(db, uid)
    profile.target_position = None
    profile.target_industry = None
    profile.career_summary = None
    profile.experience_year = None
    profile.confidence_score = None
    profile.updated_at = datetime.utcnow()

    db.commit()
    return {"ok": True, "message": "已清空职业画像与 Career Memory（对话记录保留）"}

