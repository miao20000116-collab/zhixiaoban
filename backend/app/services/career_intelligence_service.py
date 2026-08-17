"""Career Intelligence orchestration — gap + plan + persist recommendations."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.agents.career_gap.agent import CareerGapAgent
from app.agents.career_gap.schema import CareerGapResult
from app.agents.evaluation.agent import EvaluationAgent
from app.agents.recommendation.agent import RecommendationAgent
from app.agents.recommendation.schema import RecommendationPlan
from app.evaluation import save_evaluation_record
from app.memory.service import build_memory_context
from app.models.career_gap import CareerGap
from app.models.career_profile import CareerProfile
from app.models.career_status import CareerStatus
from app.models.experience import Experience
from app.models.project import Project
from app.models.recommendation import Recommendation
from app.models.skill import Skill
from app.services.career_status_service import (
    build_companionship_context,
    get_or_create_career_status,
    sanitize_latest_gap_for_display,
)
from app.services.task_memory_service import (
    create_or_update_task,
    format_task_context,
    get_active_task,
    infer_goal,
    infer_task_type,
    sync_task_from_history,
    task_to_dict,
)


def _insufficient_gap_input(
    *,
    memory: str,
    target_position: str | None,
    target_jd: str | None,
) -> bool:
    has_target = bool((target_position or "").strip() or (target_jd or "").strip())
    has_memory = bool((memory or "").strip() and "暂无" not in memory and len(memory.strip()) >= 40)
    return not (has_target and has_memory)


def build_insufficient_gap_result(
    *,
    target_position: str | None = None,
    company: str | None = None,
) -> CareerGapResult:
    return CareerGapResult(
        target_position=target_position,
        company=company,
        match_score=0,
        strengths=[],
        gaps=[],
        evidence=[],
        summary="信息不足，暂不生成能力匹配评分。请先补充目标岗位/JD和至少一段真实经历。",
        recommendations=[
            {
                "action": "补充目标岗位 JD，并上传或粘贴简历/项目经历",
                "why": "Career Gap 需要同时比较岗位标准与个人真实经历；缺任一侧都会产生误导性评分。",
                "priority": "high",
            }
        ],
        evaluation={
            "risk_level": "not_applicable",
            "score": None,
            "problems": ["目标岗位/JD或职业记忆不足，本次未执行评分。"],
            "suggestions": ["补充 JD、简历或关键项目经历后再分析。"],
            "fabricated_claims": [],
        },
    )


def format_gap_markdown(gap: CareerGapResult) -> str:
    not_applicable = bool(
        gap.evaluation and gap.evaluation.get("risk_level") == "not_applicable"
    )
    lines = [
        "# 职业差距分析",
        "",
        f"**目标岗位：** {gap.target_position or '—'}",
    ]
    if gap.company:
        lines.append(f"**公司：** {gap.company}")
    if not_applicable:
        lines.extend(["", "**综合匹配：** 暂不评分", ""])
    else:
        lines.extend(["", f"**综合匹配：** {gap.match_score}%", ""])
    if gap.summary:
        lines.append(gap.summary)
        lines.append("")

    lines.append("## 优势")
    if gap.strengths:
        for i, s in enumerate(gap.strengths, 1):
            lines.append(f"{i}. **{s.title}**")
            if s.reason:
                lines.append(f"   - 为什么：{s.reason}")
            for ev in s.evidence:
                lines.append(f"   - 来源：{ev.source}（{ev.claim}）")
    else:
        lines.append("- （暂无足够记忆支撑的优势，请先补充经历）")

    lines.extend(["", "## 能力缺口"])
    if gap.gaps:
        for i, g in enumerate(gap.gaps, 1):
            lines.append(f"{i}. **{g.title}**")
            lines.append(f"   - 原因：{g.reason}")
            for ev in g.evidence:
                lines.append(f"   - 来源：{ev.source}")
    else:
        lines.append("- （暂无明显缺口）")

    lines.extend(["", "## 提升建议"])
    for i, r in enumerate(gap.recommendations, 1):
        lines.append(f"{i}. {r.action}（优先级：{r.priority}）")
        if r.why:
            lines.append(f"   - 为什么：{r.why}")

    if gap.evidence:
        lines.extend(["", "## 来源依据"])
        for ev in gap.evidence[:8]:
            lines.append(f"- {ev.claim}（{ev.source}）")

    if gap.evaluation:
        lines.extend(
            [
                "",
                "## 真实性检查",
                f"- 风险：{gap.evaluation.get('risk_level', '—')}",
                f"- 质量分：{gap.evaluation.get('score') if gap.evaluation.get('score') is not None else '暂不评分'}",
            ]
        )
    return "\n".join(lines)


def format_plan_markdown(plan: RecommendationPlan) -> str:
    lines = ["# 下一步行动计划", ""]
    if plan.goal:
        lines.append(f"**目标：** {plan.goal}")
        lines.append("")
    if plan.summary:
        lines.append(plan.summary)
        lines.append("")
    if plan.plan:
        lines.append("## 职业路线")
        for i, step in enumerate(plan.plan, 1):
            lines.append(f"### 阶段{i}：{step.step}")
            if step.reason:
                lines.append(f"- 原因：{step.reason}")
            if step.source:
                lines.append(f"- 依据：{step.source}")
            lines.append(f"- 优先级：{step.priority}")
            lines.append("")
    if plan.recommendations:
        lines.append("## 优先建议")
        for rec in plan.recommendations:
            lines.append(f"- **{rec.action}**（{rec.priority}）")
            if rec.why:
                lines.append(f"  - 为什么：{rec.why}")
            if rec.sources:
                labels = [
                    s.get("label", "") if isinstance(s, dict) else str(s) for s in rec.sources
                ]
                lines.append(f"  - 依据：{' · '.join([x for x in labels if x])}")
    return "\n".join(lines)


def gap_to_dict(gap: CareerGapResult) -> dict[str, Any]:
    return gap.model_dump()


def _clear_latest_gap(db: Session, status: CareerStatus) -> None:
    if status.latest_gap is None:
        return
    status.latest_gap = None
    status.updated_at = datetime.utcnow()
    db.add(status)
    db.commit()


def plan_to_next_action(plan: RecommendationPlan, *, trigger: str = "career_plan") -> dict[str, Any]:
    primary = plan.recommendations[0] if plan.recommendations else None
    action = (primary.action if primary else None) or plan.primary_action or "继续完善求职材料"
    why = (primary.why if primary else None) or plan.summary or "基于职业差距与任务进度"
    sources = (primary.sources if primary else None) or [
        {"type": "gap", "label": "Career Gap Analysis"},
        {"type": "task", "label": "Task Memory"},
    ]
    priority = (primary.priority if primary else None) or "high"
    return {
        "trigger": trigger,
        "title": "行动计划",
        "message": action,
        "why": why,
        "sources": sources,
        "priority": priority,
        "goal": plan.goal,
        "plan": [s.model_dump() for s in plan.plan],
        "actions": [
            {"id": f"step_{i}", "label": s.step, "intent": "career_consult"}
            for i, s in enumerate(plan.plan[:3])
        ]
        or [{"id": "follow", "label": action, "intent": "career_consult"}],
    }


def save_recommendation(
    db: Session,
    user_id: uuid.UUID,
    *,
    action: str,
    why: str | None = None,
    sources: list | None = None,
    priority: str = "medium",
    conversation_id: uuid.UUID | None = None,
    trigger: str | None = None,
    plan: list | None = None,
) -> Recommendation:
    row = Recommendation(
        user_id=user_id,
        conversation_id=conversation_id,
        action=action,
        why=why,
        sources=sources or [],
        priority=priority,
        status="pending",
        trigger=trigger,
        plan=plan,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def build_user_profile_payload(db: Session, user_id: uuid.UUID) -> dict[str, Any]:
    profile = db.query(CareerProfile).filter(CareerProfile.user_id == user_id).first()
    experiences = db.query(Experience).filter(Experience.user_id == user_id).all()
    projects = db.query(Project).filter(Project.user_id == user_id).all()
    skills = db.query(Skill).filter(Skill.user_id == user_id).all()
    return {
        "target_position": profile.target_position if profile else None,
        "target_industry": getattr(profile, "target_industry", None) if profile else None,
        "experience_year": profile.experience_year if profile else None,
        "career_summary": profile.career_summary if profile else None,
        "experiences": [
            {
                "position": e.position,
                "company": e.company,
                "duration": e.duration,
                "responsibility": e.responsibility,
                "achievement": e.achievement,
                "source": e.source,
            }
            for e in experiences
        ],
        "projects": [
            {
                "project_name": p.project_name,
                "background": p.background,
                "goal": p.goal,
                "role": p.role,
                "action": p.action,
                "result": p.result,
                "skill_tags": p.skill_tags,
                "source": getattr(p, "source", None),
            }
            for p in projects
        ],
        "skills": [{"skill_name": s.skill_name, "level": s.level, "source": s.source} for s in skills],
    }


def build_career_memory_payload(db: Session, user_id: uuid.UUID) -> dict[str, Any]:
    """Subset of career memory used by Gap Agent (experience/project/skill/achievement)."""
    profile = build_user_profile_payload(db, user_id)
    achievements: list[str] = []
    for e in profile.get("experiences") or []:
        if e.get("achievement"):
            achievements.append(str(e["achievement"]))
    for p in profile.get("projects") or []:
        if p.get("result"):
            achievements.append(str(p["result"]))
    return {
        "experience": profile.get("experiences") or [],
        "project": profile.get("projects") or [],
        "skill": profile.get("skills") or [],
        "achievement": achievements,
    }


def build_target_jd_payload(
    *,
    jd_text: str | None = None,
    position: str | None = None,
    company: str | None = None,
    job_analysis: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if job_analysis:
        overview = job_analysis.get("position_overview") or {}
        return {
            "position": overview.get("position") or position,
            "company": overview.get("company") or company,
            "responsibilities": job_analysis.get("core_responsibilities") or [],
            "required_skills": job_analysis.get("required_skills") or [],
            "nice_to_have_skills": job_analysis.get("nice_to_have_skills") or [],
            "keywords": job_analysis.get("interview_focus") or [],
            "jd_text": jd_text,
        }
    return {
        "position": position,
        "company": company,
        "responsibilities": [],
        "required_skills": [],
        "nice_to_have_skills": [],
        "keywords": [],
        "jd_text": jd_text,
    }


def persist_career_gap(
    db: Session,
    user_id: uuid.UUID,
    gap: CareerGapResult,
    *,
    jd_id: uuid.UUID | None = None,
) -> CareerGap:
    row = CareerGap(
        user_id=user_id,
        jd_id=jd_id,
        target_position=gap.target_position,
        company=gap.company,
        match_score=int(gap.match_score or 0),
        strengths=[s.model_dump() for s in gap.strengths],
        gaps=[g.model_dump() for g in gap.gaps],
        recommendations=[r.model_dump() for r in gap.recommendations],
        evidence=[e.model_dump() for e in gap.evidence],
        result_json=gap_to_dict(gap),
        evaluation_json=gap.evaluation,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


async def run_gap_analysis(
    db: Session,
    user_id: uuid.UUID,
    *,
    target_position: str | None = None,
    company: str | None = None,
    target_jd: str | None = None,
    industry_context: str = "",
    jd_id: uuid.UUID | None = None,
    job_analysis: dict[str, Any] | None = None,
    allow_implicit_target: bool = False,
    continue_previous: bool = False,
) -> CareerGapResult:
    memory = build_memory_context(db, user_id)
    status = get_or_create_career_status(db, user_id)
    profile = db.query(CareerProfile).filter(CareerProfile.user_id == user_id).first()

    explicit_target = bool(
        (target_position or "").strip()
        or (target_jd or "").strip()
        or (company or "").strip()
        or bool(job_analysis)
    )
    # Empty API / empty chat request: never reuse profile or latest_gap silently.
    # Also clear stale sidebar score so Profile no longer shows pre-fix junk.
    if not explicit_target and not allow_implicit_target and not continue_previous:
        _clear_latest_gap(db, status)
        return build_insufficient_gap_result()

    # Resolve target: explicit args → JD analysis → (optional) profile / last gap
    if not target_position and job_analysis:
        overview = job_analysis.get("position_overview") or {}
        target_position = overview.get("position") or target_position
        company = company or overview.get("company")
    if allow_implicit_target and not target_position and profile and profile.target_position:
        target_position = profile.target_position
    if continue_previous and not target_position and status.latest_gap:
        prev = status.latest_gap.get("target_position")
        if prev:
            target_position = prev

    if _insufficient_gap_input(
        memory=memory,
        target_position=target_position,
        target_jd=target_jd,
    ):
        # Don't overwrite a previously good gap when user only lacks memory yet —
        # but never leave a score-only junk row either.
        if status.latest_gap and sanitize_latest_gap_for_display(status.latest_gap) is None:
            _clear_latest_gap(db, status)
        return build_insufficient_gap_result(target_position=target_position, company=company)

    user_profile = build_user_profile_payload(db, user_id)
    career_memory = build_career_memory_payload(db, user_id)
    target_jd_structured = build_target_jd_payload(
        jd_text=target_jd,
        position=target_position,
        company=company,
        job_analysis=job_analysis,
    )

    gap = await CareerGapAgent().analyze(
        memory_context=memory,
        target_jd=target_jd,
        target_position=target_position,
        company=company,
        industry_context=industry_context,
        career_status_context=build_companionship_context(status),
        user_profile=user_profile,
        career_memory=career_memory,
        target_jd_structured=target_jd_structured,
    )

    evaluation = await EvaluationAgent().evaluate_career_gap(
        gap_json=gap.model_dump_json(indent=2),
        memory_context=memory,
        target_jd=target_jd,
        target_position=target_position,
    )
    gap.evaluation = evaluation.model_dump()
    save_evaluation_record(
        db,
        agent_name="career_gap",
        task_type="analyze",
        evaluation=evaluation,
        input_data={
            "target_position": target_position,
            "company": company,
            "jd_id": str(jd_id) if jd_id else None,
            "target_jd": (target_jd or "")[:2000],
        },
        output_data=gap.model_dump(exclude={"evaluation"}),
        user_id=user_id,
    )

    if gap.match_score <= 0 and not gap.gaps and not gap.strengths:
        gap.evaluation = {
            "risk_level": "not_applicable",
            "score": None,
            "problems": ["分析未产出可用优势/缺口，本次未保存为最新 Gap。"],
            "suggestions": ["补充更完整的目标 JD 和个人经历后重试。"],
            "fabricated_claims": [],
        }
        return gap

    status.latest_gap = gap_to_dict(gap)
    if gap.gaps:
        status.focus_areas = [g.title for g in gap.gaps[:5]]
        status.weakness = "；".join(g.title for g in gap.gaps[:3])
    if gap.strengths:
        status.strength = "；".join(s.title for s in gap.strengths[:3])
    status.updated_at = datetime.utcnow()
    db.add(status)
    db.commit()
    persist_career_gap(db, user_id, gap, jd_id=jd_id)
    return gap


async def run_action_plan(
    db: Session,
    user_id: uuid.UUID,
    *,
    user_goal: str,
    conversation_id: uuid.UUID | None = None,
    gap: CareerGapResult | None = None,
) -> tuple[RecommendationPlan, dict[str, Any]]:
    memory = build_memory_context(db, user_id)
    task = get_active_task(db, user_id, conversation_id=conversation_id)
    task_ctx = format_task_context(task)
    gap_ctx = ""
    if gap is None:
        status = get_or_create_career_status(db, user_id)
        if status.latest_gap:
            gap_ctx = str(status.latest_gap)
    else:
        gap_ctx = gap.model_dump_json(indent=2)

    plan = await RecommendationAgent().plan(
        user_goal=user_goal,
        memory_context=memory,
        gap_context=gap_ctx,
        task_context=task_ctx,
        history_context="",
    )

    evaluation = await EvaluationAgent().evaluate_recommendation(
        plan_json=plan.model_dump_json(indent=2),
        memory_context=memory,
        gap_context=gap_ctx,
        task_context=task_ctx,
    )
    plan.evaluation = evaluation.model_dump()

    next_action = plan_to_next_action(plan)
    primary = plan.recommendations[0] if plan.recommendations else None
    save_recommendation(
        db,
        user_id,
        action=next_action["message"],
        why=next_action.get("why"),
        sources=next_action.get("sources"),
        priority=(primary.priority if primary else "high"),
        conversation_id=conversation_id,
        trigger="career_plan",
        plan=next_action.get("plan"),
    )

    # Update task next action from plan
    create_or_update_task(
        db,
        user_id,
        goal=plan.goal or user_goal,
        task_type=infer_task_type(user_goal, "career_consult"),
        conversation_id=conversation_id,
        next_action=next_action["message"],
        meta={"plan_goal": plan.goal},
    )
    return plan, next_action


async def intelligence_for_message(
    db: Session,
    user_id: uuid.UUID,
    user_message: str,
    *,
    conversation_id: uuid.UUID | None = None,
    intent: str | None = None,
    target_position: str | None = None,
    company: str | None = None,
    target_jd: str | None = None,
    force_gap: bool = False,
) -> dict[str, Any]:
    """
    Career Intelligence Layer entry:
    read memory → task → (optional) gap → recommendation plan.
    """
    goal = infer_goal(user_message, position=target_position, company=company)
    task_type = infer_task_type(user_message, intent)
    task = create_or_update_task(
        db,
        user_id,
        goal=goal,
        task_type=task_type,
        conversation_id=conversation_id,
        meta={"last_intent": intent},
    )
    task = sync_task_from_history(db, user_id, conversation_id=conversation_id) or task

    wants_gap = force_gap or any(
        k in user_message
        for k in ["差距", "匹配", "转岗", "转行", "缺什么", "能力缺口", "想找", "我想做"]
    )
    wants_plan = wants_gap or any(
        k in user_message for k in ["下一步", "规划", "路线", "怎么准备", "如何提升"]
    )

    gap: CareerGapResult | None = None
    plan: RecommendationPlan | None = None
    next_action: dict[str, Any] | None = None
    markdown_parts: list[str] = []

    if wants_gap or target_jd:
        continue_previous = any(k in user_message for k in ["继续上次", "继续分析", "沿用上次", "上次的目标"])
        gap = await run_gap_analysis(
            db,
            user_id,
            target_position=target_position,
            company=company,
            target_jd=target_jd,
            continue_previous=continue_previous,
        )
        markdown_parts.append(format_gap_markdown(gap))
        create_or_update_task(
            db,
            user_id,
            goal=goal,
            task_type="career_growth" if wants_gap else task_type,
            conversation_id=conversation_id,
            completed_step="差距分析" if wants_gap else None,
            next_action=gap.recommendations[0].action if gap.recommendations else None,
        )

    if wants_plan or gap is not None:
        plan, next_action = await run_action_plan(
            db,
            user_id,
            user_goal=goal,
            conversation_id=conversation_id,
            gap=gap,
        )
        markdown_parts.append(format_plan_markdown(plan))

    task = get_active_task(db, user_id, conversation_id=conversation_id) or task
    return {
        "task": task_to_dict(task) if task else None,
        "gap": gap_to_dict(gap) if gap else None,
        "plan": plan.model_dump() if plan else None,
        "next_action": next_action,
        "markdown": "\n\n".join(markdown_parts) if markdown_parts else "",
    }
