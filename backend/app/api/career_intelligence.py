"""Career Intelligence APIs — gap, tasks, recommendations (Chat First, no new pages)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.models.recommendation import Recommendation
from app.services.career_intelligence_service import (
    format_gap_markdown,
    format_plan_markdown,
    run_action_plan,
    run_gap_analysis,
)
from app.services.career_status_service import get_or_create_career_status, sanitize_latest_gap_for_display, status_to_dict
from app.services.dev_user import get_or_create_dev_user
from app.services.task_memory_service import get_active_task, list_active_tasks, task_to_dict

router = APIRouter(tags=["career-intelligence"])


class GapAnalyzeRequest(BaseModel):
    target_position: str | None = None
    company: str | None = None
    target_jd: str | None = Field(default=None, max_length=20000)
    industry_context: str | None = None


class PlanRequest(BaseModel):
    user_goal: str = Field(min_length=1, max_length=500)
    conversation_id: uuid.UUID | None = None


@router.get("/career/gap")
def get_latest_gap(db: Session = Depends(get_db)) -> dict:
    user = get_or_create_dev_user(db)
    status = get_or_create_career_status(db, user.id)
    return {"gap": sanitize_latest_gap_for_display(status.latest_gap)}


@router.post("/career/gap/analyze")
async def analyze_gap(body: GapAnalyzeRequest, db: Session = Depends(get_db)) -> dict:
    user = get_or_create_dev_user(db)
    try:
        gap = await run_gap_analysis(
            db,
            user.id,
            target_position=body.target_position,
            company=body.company,
            target_jd=body.target_jd,
            industry_context=body.industry_context or "",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Gap 分析失败: {exc}") from exc
    return {
        "gap": gap.model_dump(),
        "markdown": format_gap_markdown(gap),
    }


@router.get("/career/tasks")
def get_tasks(db: Session = Depends(get_db)) -> dict:
    user = get_or_create_dev_user(db)
    tasks = list_active_tasks(db, user.id)
    active = get_active_task(db, user.id)
    return {
        "active": task_to_dict(active) if active else None,
        "tasks": [task_to_dict(t) for t in tasks],
    }


@router.get("/career/tasks/active")
def get_active_task_api(
    conversation_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
) -> dict:
    user = get_or_create_dev_user(db)
    task = get_active_task(db, user.id, conversation_id=conversation_id)
    return {"task": task_to_dict(task) if task else None}


@router.post("/career/plan")
async def create_plan(body: PlanRequest, db: Session = Depends(get_db)) -> dict:
    user = get_or_create_dev_user(db)
    try:
        plan, next_action = await run_action_plan(
            db,
            user.id,
            user_goal=body.user_goal,
            conversation_id=body.conversation_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"行动计划失败: {exc}") from exc
    return {
        "plan": plan.model_dump(),
        "next_action": next_action,
        "markdown": format_plan_markdown(plan),
    }


@router.get("/career/recommendations")
def list_recommendations(db: Session = Depends(get_db), limit: int = 10) -> dict:
    user = get_or_create_dev_user(db)
    rows = (
        db.query(Recommendation)
        .filter(Recommendation.user_id == user.id)
        .order_by(Recommendation.created_at.desc())
        .limit(min(limit, 50))
        .all()
    )
    return {
        "items": [
            {
                "id": str(r.id),
                "action": r.action,
                "why": r.why,
                "sources": r.sources,
                "priority": r.priority,
                "status": r.status,
                "trigger": r.trigger,
                "plan": r.plan,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    }


@router.get("/career/intelligence")
def get_intelligence_snapshot(db: Session = Depends(get_db)) -> dict:
    """Single payload for Profile / sidebar — no new page needed."""
    user = get_or_create_dev_user(db)
    status = get_or_create_career_status(db, user.id)
    task = get_active_task(db, user.id)
    return {
        "career_status": status_to_dict(status),
        "latest_gap": sanitize_latest_gap_for_display(status.latest_gap),
        "active_task": task_to_dict(task) if task else None,
    }
