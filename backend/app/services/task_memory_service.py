"""Task Memory — track what the user is currently working toward."""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any, Literal

from sqlalchemy.orm import Session

from app.models.career_task import CareerTask
from app.models.interview_session import InterviewSession
from app.models.job_analysis import JobAnalysis
from app.models.resume_version import ResumeVersion

TaskType = Literal[
    "job_search",
    "jd_analysis",
    "resume_prepare",
    "interview_prepare",
    "career_growth",
]

# Product-facing step lists (Phase 8.2)
DEFAULT_STEPS: dict[str, list[str]] = {
    "job_search": ["明确目标岗位", "JD分析", "简历优化", "模拟面试", "投递复盘"],
    "jd_analysis": ["上传/粘贴JD", "完成岗位分析", "确认能力缺口", "定制简历"],
    "resume_prepare": ["解析简历", "简历优化", "STAR改写", "准备自我介绍"],
    "interview_prepare": ["JD分析", "简历优化", "项目深挖", "模拟面试", "复盘"],
    "career_growth": ["差距分析", "制定学习计划", "补充项目案例", "阶段复盘"],
}

# Sub-workflow types that should continue a broader journey task when present
_SUBTYPE_PARENTS: dict[str, set[str]] = {
    "jd_analysis": {"job_search", "interview_prepare"},
    "resume_prepare": {"job_search", "interview_prepare"},
}

# Related job-prep types share one continuous journey across conversations
_RELATED_JOURNEY_TYPES = frozenset(
    {"job_search", "jd_analysis", "resume_prepare", "interview_prepare"}
)
_UMBRELLA_TYPES = frozenset({"job_search", "interview_prepare"})

# Normalize synonymous step names onto the canonical label used in DEFAULT_STEPS
STEP_ALIASES: dict[str, str] = {
    "完成岗位分析": "JD分析",
    "上传/粘贴JD": "JD分析",
    "JD对齐": "JD分析",
    "按JD优化": "简历优化",
    "解析简历": "简历优化",
}

_CLEAR_GOAL_KEYWORDS = (
    "准备",
    "面试",
    "投递",
    "想找",
    "目标是",
    "目标岗位",
    "转岗",
    "转行",
    "我要",
    "帮我准备",
    "冲刺",
    "求职",
    "应聘",
)


def task_to_dict(task: CareerTask) -> dict[str, Any]:
    return {
        "id": str(task.id),
        "user_id": str(task.user_id),
        "conversation_id": str(task.conversation_id) if task.conversation_id else None,
        "task_type": task.task_type,
        "goal": task.goal,
        "status": task.status,
        "progress": round(float(task.progress or 0), 2),
        "completed_steps": task.completed_steps or [],
        "pending_steps": task.pending_steps or [],
        "next_action": task.next_action,
        "meta": task.meta or {},
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
    }


def format_task_context(task: CareerTask | None) -> str:
    if task is None:
        return "（当前无进行中的任务）"
    done = task.completed_steps or []
    pending = task.pending_steps or []
    lines = [
        f"任务：{task.goal}",
        f"类型：{task.task_type}",
        f"状态：{task.status} · 进度 {int((task.progress or 0) * 100)}%",
        f"已完成：{', '.join(done) if done else '无'}",
        f"未完成：{', '.join(pending) if pending else '无'}",
        f"下一步：{task.next_action or '待规划'}",
    ]
    return "\n".join(lines)


def get_active_task(
    db: Session,
    user_id: uuid.UUID,
    *,
    conversation_id: uuid.UUID | None = None,
) -> CareerTask | None:
    q = (
        db.query(CareerTask)
        .filter(CareerTask.user_id == user_id, CareerTask.status == "active")
        .order_by(CareerTask.updated_at.desc())
    )
    if conversation_id is not None:
        task = q.filter(CareerTask.conversation_id == conversation_id).first()
        if task:
            return task
    return q.first()


def list_active_tasks(db: Session, user_id: uuid.UUID, limit: int = 10) -> list[CareerTask]:
    return (
        db.query(CareerTask)
        .filter(CareerTask.user_id == user_id, CareerTask.status == "active")
        .order_by(CareerTask.updated_at.desc())
        .limit(limit)
        .all()
    )


def infer_task_type(text: str, intent: str | None = None) -> TaskType:
    t = text.strip()
    if intent == "interview" or any(k in t for k in ["面试", "模拟面试"]):
        return "interview_prepare"
    if intent == "jd_analysis" or any(k in t for k in ["分析JD", "岗位分析", "JD"]):
        return "jd_analysis"
    if intent == "resume" or any(k in t for k in ["简历", "STAR"]):
        return "resume_prepare"
    if intent == "career_consult" or any(k in t for k in ["转岗", "转行", "成长", "提升", "差距", "规划"]):
        return "career_growth"
    return "job_search"


def infer_goal(text: str, *, position: str | None = None, company: str | None = None) -> str:
    if company and position:
        return f"准备{company}{position}岗位"
    if position:
        return f"准备{position}岗位求职"
    if company:
        return f"准备{company}相关岗位"
    cleaned = text.strip().replace("\n", " ")
    if len(cleaned) <= 40:
        return cleaned or "求职准备"
    return cleaned[:40] + "…"


def has_clear_goal(text: str, intent: str | None = None) -> bool:
    """True when the user expresses a lasting objective worth Task Memory."""
    t = (text or "").strip()
    if len(t) < 4:
        return False
    if any(k in t for k in _CLEAR_GOAL_KEYWORDS):
        return True
    if intent in ("jd_analysis", "resume", "interview", "career_consult") and len(t) >= 8:
        return True
    return False


def _canonical_step(step: str) -> str:
    return STEP_ALIASES.get(step, step)


def _mark_step_lists(
    completed: list[str],
    pending: list[str],
    step: str,
    *,
    all_steps: list[str] | None = None,
) -> tuple[list[str], list[str]]:
    """Mark a step (and aliases) done; keep pending consistent with known steps."""
    canonical = _canonical_step(step)
    label = canonical
    if all_steps and canonical not in all_steps and step in all_steps:
        label = step

    # Remove any synonym still sitting in pending
    synonyms = {step, canonical, label}
    for alias, target in STEP_ALIASES.items():
        if target in synonyms or alias in synonyms:
            synonyms.add(alias)
            synonyms.add(target)

    pending = [s for s in pending if s not in synonyms]
    if label not in completed:
        completed.append(label)

    if all_steps is not None:
        pending = [s for s in all_steps if s not in completed]
    return completed, pending


def _recompute_progress(completed: list[str], pending: list[str]) -> float:
    total = len(completed) + len(pending)
    if total == 0:
        return 0.0
    return round(len(completed) / total, 2)


def _resolve_task_type(existing: CareerTask | None, requested: TaskType) -> TaskType:
    """Keep one continuous journey across JD → resume → interview turns."""
    if existing is None:
        return requested
    parents = _SUBTYPE_PARENTS.get(requested)
    if parents and existing.task_type in parents:
        return existing.task_type  # type: ignore[return-value]
    if existing.task_type in _RELATED_JOURNEY_TYPES and requested in _RELATED_JOURNEY_TYPES:
        if requested in _UMBRELLA_TYPES:
            return requested
        if existing.task_type in _UMBRELLA_TYPES:
            return existing.task_type  # type: ignore[return-value]
        # Narrow subtype → narrow subtype: coalesce into interview journey
        return "interview_prepare"
    return requested


def create_or_update_task(
    db: Session,
    user_id: uuid.UUID,
    *,
    goal: str,
    task_type: TaskType = "job_search",
    conversation_id: uuid.UUID | None = None,
    completed_step: str | None = None,
    next_action: str | None = None,
    meta: dict[str, Any] | None = None,
    force_new: bool = False,
) -> CareerTask:
    task = None if force_new else get_active_task(db, user_id, conversation_id=conversation_id)
    resolved_type = _resolve_task_type(task, task_type)
    steps = list(DEFAULT_STEPS.get(resolved_type, DEFAULT_STEPS["job_search"]))

    if task is None:
        pending = steps.copy()
        completed: list[str] = []
        if completed_step:
            completed, pending = _mark_step_lists(completed, pending, completed_step, all_steps=steps)
        task = CareerTask(
            user_id=user_id,
            conversation_id=conversation_id,
            task_type=resolved_type,
            goal=goal,
            status="active",
            progress=_recompute_progress(completed, pending),
            completed_steps=completed,
            pending_steps=pending,
            next_action=next_action or (pending[0] if pending else "任务已基本完成"),
            meta=meta or {},
        )
        db.add(task)
    else:
        if goal and len(goal) >= 4:
            # Prefer more specific goals (company/position) over short generic ones
            if len(goal) >= len(task.goal or "") or not task.goal:
                task.goal = goal
        type_changed = bool(resolved_type and task.task_type != resolved_type)
        if resolved_type:
            task.task_type = resolved_type
        # Bind to the conversation that is currently advancing the task
        if conversation_id:
            task.conversation_id = conversation_id
        completed = list(task.completed_steps or [])
        pending = list(task.pending_steps or [])
        if type_changed or (not pending and not completed):
            pending = [step for step in steps if step not in completed]
        if completed_step:
            completed, pending = _mark_step_lists(
                completed, pending, completed_step, all_steps=steps if type_changed else None
            )
            if not type_changed:
                # Keep pending aligned without wiping custom ordering
                pending = [s for s in pending if s not in completed]
                for s in steps:
                    if s not in completed and s not in pending:
                        pending.append(s)
        task.completed_steps = completed
        task.pending_steps = pending
        task.progress = _recompute_progress(completed, pending)
        if next_action:
            task.next_action = next_action
        elif pending:
            task.next_action = pending[0]
        else:
            task.next_action = "复盘本轮求职并规划下一轮投递"
            task.status = "completed"
            task.progress = 1.0
        if meta:
            task.meta = {**(task.meta or {}), **meta}
        task.updated_at = datetime.utcnow()
        db.add(task)

    db.commit()
    db.refresh(task)
    return task


def ensure_task_from_message(
    db: Session,
    user_id: uuid.UUID,
    user_message: str,
    *,
    intent: str | None = None,
    conversation_id: uuid.UUID | None = None,
    position: str | None = None,
    company: str | None = None,
) -> CareerTask | None:
    """
    Master-facing Task Memory entry:
    - If a related active Task exists → continue it (touch updated_at / refine goal).
    - Else if the message has a clear goal → create a new Task.
    - Else → do nothing.
    """
    existing = get_active_task(db, user_id, conversation_id=conversation_id)
    if existing is not None:
        goal = infer_goal(user_message, position=position, company=company)
        # Refine goal when user mentions a more concrete target
        refine = bool(position or company) or (
            has_clear_goal(user_message, intent) and len(goal) >= 6
        )
        return create_or_update_task(
            db,
            user_id,
            goal=goal if refine else existing.goal,
            task_type=infer_task_type(user_message, intent),
            conversation_id=conversation_id,
            meta={"source": "master_continue", "last_intent": intent},
        )

    if not has_clear_goal(user_message, intent):
        return None

    return create_or_update_task(
        db,
        user_id,
        goal=infer_goal(user_message, position=position, company=company),
        task_type=infer_task_type(user_message, intent),
        conversation_id=conversation_id,
        next_action=None,
        meta={"source": "master_create", "last_intent": intent},
    )


def mark_step_done(
    db: Session,
    user_id: uuid.UUID,
    step: str,
    *,
    conversation_id: uuid.UUID | None = None,
    next_action: str | None = None,
) -> CareerTask | None:
    task = get_active_task(db, user_id, conversation_id=conversation_id)
    if task is None:
        return None
    return create_or_update_task(
        db,
        user_id,
        goal=task.goal,
        task_type=task.task_type,  # type: ignore[arg-type]
        conversation_id=conversation_id or task.conversation_id,
        completed_step=step,
        next_action=next_action,
    )


def sync_task_from_history(
    db: Session,
    user_id: uuid.UUID,
    *,
    conversation_id: uuid.UUID | None = None,
) -> CareerTask | None:
    """Refresh completed steps from persisted workflow artifacts (end-of-turn)."""
    task = get_active_task(db, user_id, conversation_id=conversation_id)
    if task is None:
        return None

    completed = list(task.completed_steps or [])
    pending = list(task.pending_steps or [])
    steps = list(DEFAULT_STEPS.get(task.task_type, DEFAULT_STEPS["job_search"]))

    def _done(step: str) -> None:
        nonlocal completed, pending
        completed, pending = _mark_step_lists(completed, pending, step, all_steps=None)
        pending = [s for s in pending if s not in completed]
        for s in steps:
            if s not in completed and s not in pending:
                pending.append(s)

    if db.query(JobAnalysis).filter(JobAnalysis.user_id == user_id).count() > 0:
        _done("JD分析")
        _done("完成岗位分析")
        _done("上传/粘贴JD")
    if db.query(ResumeVersion).filter(ResumeVersion.user_id == user_id).count() > 0:
        _done("简历优化")
        _done("按JD优化")
        _done("解析简历")
    if (
        db.query(InterviewSession)
        .filter(InterviewSession.user_id == user_id, InterviewSession.status == "completed")
        .count()
        > 0
    ):
        _done("模拟面试")

    task.completed_steps = completed
    task.pending_steps = pending
    task.progress = _recompute_progress(completed, pending)
    if pending:
        task.next_action = pending[0]
        task.status = "active"
    else:
        task.next_action = "复盘本轮求职并规划下一轮投递"
        task.status = "completed"
        task.progress = 1.0
    task.updated_at = datetime.utcnow()
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def extract_company_position(text: str) -> tuple[str | None, str | None]:
    """Best-effort extract company/position from short goal utterances."""
    company_pat = r"字节|阿里|腾讯|美团|百度|华为|快手|小红书|网易|京东|拼多多|OpenAI|Google"
    position_pat = r"AI产品经理|产品经理|算法工程师|数据分析|运营|前端|后端|全栈|设计师"
    m = re.search(rf"({company_pat}).{{0,8}}?({position_pat})", text)
    if m:
        return m.group(1), m.group(2)
    m_pos = re.search(rf"({position_pat})", text)
    position = m_pos.group(1) if m_pos else None
    m_co = re.search(rf"({company_pat})", text)
    company = m_co.group(1) if m_co else None
    return company, position
