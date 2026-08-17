"""Evaluation QC service — records, bad cases, dashboard metrics."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.agents.evaluation.schema import EvaluationResult
from app.models.agent_run import AgentRun
from app.models.bad_case import BadCase
from app.models.evaluation_record import EvaluationRecord
from app.models.prompt_template import PromptTemplate


def save_evaluation_record(
    db: Session,
    *,
    agent_name: str,
    task_type: str,
    evaluation: EvaluationResult | dict[str, Any],
    input_data: dict[str, Any] | None = None,
    output_data: dict[str, Any] | None = None,
    user_id: uuid.UUID | None = None,
    conversation_id: uuid.UUID | None = None,
    trace_id: uuid.UUID | None = None,
    auto_bad_case: bool = True,
) -> EvaluationRecord:
    """Persist Evaluation result and optionally open a BadCase for high risk."""
    payload = evaluation.model_dump() if isinstance(evaluation, EvaluationResult) else dict(evaluation)
    record = EvaluationRecord(
        user_id=user_id,
        conversation_id=conversation_id,
        agent_name=agent_name,
        task_type=task_type,
        input_data=input_data,
        output_data=output_data,
        score=payload.get("score"),
        risk_level=payload.get("risk_level", "low"),
        feedback=payload,
        trace_id=trace_id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    if auto_bad_case and record.risk_level == "high":
        claims = payload.get("fabricated_claims") or payload.get("problems") or []
        description = "; ".join(str(c) for c in claims[:5]) or "高风险输出"
        create_bad_case(
            db,
            agent_name=agent_name,
            problem_type="hallucination" if payload.get("fabricated_claims") else "high_risk",
            description=description,
            solution="对照原文修订；必要时回退 Prompt / 加强约束",
            user_id=user_id,
            evaluation_record_id=record.id,
            context_json={"task_type": task_type, "score": record.score},
        )
    return record


def create_bad_case(
    db: Session,
    *,
    agent_name: str,
    problem_type: str,
    description: str,
    solution: str | None = None,
    status: str = "open",
    user_id: uuid.UUID | None = None,
    evaluation_record_id: uuid.UUID | None = None,
    context_json: dict[str, Any] | None = None,
) -> BadCase:
    case = BadCase(
        user_id=user_id,
        agent_name=agent_name,
        problem_type=problem_type,
        description=description,
        solution=solution,
        status=status,
        evaluation_record_id=evaluation_record_id,
        context_json=context_json,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


def update_bad_case(
    db: Session,
    case_id: uuid.UUID,
    *,
    status: str | None = None,
    solution: str | None = None,
) -> BadCase | None:
    case = db.query(BadCase).filter(BadCase.id == case_id).first()
    if case is None:
        return None
    if status is not None:
        case.status = status
    if solution is not None:
        case.solution = solution
    case.updated_at = datetime.utcnow()
    db.add(case)
    db.commit()
    db.refresh(case)
    return case


def get_dashboard_metrics(
    db: Session,
    *,
    days: int = 30,
    user_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    since = datetime.utcnow() - timedelta(days=days)

    run_q = db.query(AgentRun).filter(AgentRun.created_at >= since)
    eval_q = db.query(EvaluationRecord).filter(EvaluationRecord.created_at >= since)
    bad_q = db.query(BadCase)
    if user_id:
        run_q = run_q.filter(AgentRun.user_id == user_id)
        eval_q = eval_q.filter(EvaluationRecord.user_id == user_id)
        bad_q = bad_q.filter(BadCase.user_id == user_id)

    total_runs = run_q.count()
    success_runs = run_q.filter(AgentRun.status == "success").count()
    error_runs = run_q.filter(AgentRun.status == "error").count()

    eval_total = eval_q.count()
    high_risk = eval_q.filter(EvaluationRecord.risk_level == "high").count()
    medium_risk = eval_q.filter(EvaluationRecord.risk_level == "medium").count()
    avg_score = eval_q.with_entities(func.avg(EvaluationRecord.score)).filter(
        EvaluationRecord.score.isnot(None)
    ).scalar()

    bad_open = bad_q.filter(BadCase.status == "open").count()
    bad_total = bad_q.count()

    agent_stats = []
    for agent_name, count, avg in (
        eval_q.with_entities(
            EvaluationRecord.agent_name,
            func.count(EvaluationRecord.id),
            func.avg(EvaluationRecord.score),
        )
        .group_by(EvaluationRecord.agent_name)
        .all()
    ):
        high = eval_q.filter(
            EvaluationRecord.agent_name == agent_name,
            EvaluationRecord.risk_level == "high",
        ).count()
        agent_stats.append(
            {
                "agent_name": agent_name,
                "evaluations": count,
                "avg_score": round(float(avg or 0), 1),
                "high_risk": high,
                "hallucination_rate": round(high / count, 3) if count else 0.0,
            }
        )

    prompt_versions = (
        db.query(PromptTemplate)
        .filter(PromptTemplate.status == "active")
        .order_by(PromptTemplate.agent_name.asc())
        .all()
    )

    return {
        "period_days": days,
        "agent_success_rate": round(success_runs / total_runs, 3) if total_runs else 1.0,
        "total_agent_runs": total_runs,
        "success_runs": success_runs,
        "error_runs": error_runs,
        "evaluation_count": eval_total,
        "hallucination_rate": round(high_risk / eval_total, 3) if eval_total else 0.0,
        "high_risk_count": high_risk,
        "medium_risk_count": medium_risk,
        "avg_evaluation_score": round(float(avg_score or 0), 1),
        "user_score_proxy": round(float(avg_score or 0), 1),
        "bad_case_open": bad_open,
        "bad_case_total": bad_total,
        "agent_stats": agent_stats,
        "active_prompts": [
            {
                "id": str(p.id),
                "agent_name": p.agent_name,
                "version": p.version,
                "status": p.status,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in prompt_versions
        ],
    }


def list_evaluation_records(
    db: Session,
    *,
    user_id: uuid.UUID | None = None,
    agent_name: str | None = None,
    risk_level: str | None = None,
    limit: int = 50,
) -> list[EvaluationRecord]:
    q = db.query(EvaluationRecord)
    if user_id:
        q = q.filter(EvaluationRecord.user_id == user_id)
    if agent_name:
        q = q.filter(EvaluationRecord.agent_name == agent_name)
    if risk_level:
        q = q.filter(EvaluationRecord.risk_level == risk_level)
    return q.order_by(EvaluationRecord.created_at.desc()).limit(limit).all()


def list_bad_cases(
    db: Session,
    *,
    user_id: uuid.UUID | None = None,
    status: str | None = None,
    limit: int = 50,
) -> list[BadCase]:
    q = db.query(BadCase)
    if user_id:
        q = q.filter(BadCase.user_id == user_id)
    if status:
        q = q.filter(BadCase.status == status)
    return q.order_by(BadCase.created_at.desc()).limit(limit).all()
