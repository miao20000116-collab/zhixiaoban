"""Agent Trace helper — records Master → Specialist → Evaluation chains."""

from __future__ import annotations

import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, AsyncIterator

from sqlalchemy.orm import Session

from app.models.agent_run import AgentRun


@dataclass
class TraceContext:
    """Holds the current request's trace identifiers."""

    trace_id: uuid.UUID = field(default_factory=uuid.uuid4)
    parent_run_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    conversation_id: uuid.UUID | None = None


def new_trace(
    *,
    user_id: uuid.UUID | None = None,
    conversation_id: uuid.UUID | None = None,
) -> TraceContext:
    return TraceContext(user_id=user_id, conversation_id=conversation_id)


@asynccontextmanager
async def traced_run(
    db: Session,
    ctx: TraceContext,
    *,
    agent_name: str,
    task_type: str | None = None,
    input_data: dict[str, Any] | None = None,
) -> AsyncIterator[AgentRun]:
    """Persist an AgentRun spanning the enclosed work."""
    run = AgentRun(
        trace_id=ctx.trace_id,
        parent_run_id=ctx.parent_run_id,
        user_id=ctx.user_id,
        conversation_id=ctx.conversation_id,
        agent_name=agent_name,
        task_type=task_type,
        input_data=_safe_json(input_data),
        status="running",
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    previous_parent = ctx.parent_run_id
    ctx.parent_run_id = run.id
    started = time.perf_counter()
    try:
        yield run
        run.status = "success"
        run.duration_ms = (time.perf_counter() - started) * 1000
        db.add(run)
        db.commit()
    except Exception as exc:  # noqa: BLE001 — record then re-raise
        run.status = "error"
        run.error_message = str(exc)[:2000]
        run.duration_ms = (time.perf_counter() - started) * 1000
        db.add(run)
        db.commit()
        raise
    finally:
        ctx.parent_run_id = previous_parent


def finish_run(db: Session, run: AgentRun, output_data: dict[str, Any] | None = None) -> None:
    run.output_data = _safe_json(output_data)
    db.add(run)
    db.commit()


def list_trace_runs(db: Session, trace_id: uuid.UUID) -> list[AgentRun]:
    return (
        db.query(AgentRun)
        .filter(AgentRun.trace_id == trace_id)
        .order_by(AgentRun.created_at.asc())
        .all()
    )


def _safe_json(data: dict[str, Any] | None) -> dict[str, Any] | None:
    if data is None:
        return None
    # Truncate large text fields for storage
    result: dict[str, Any] = {}
    for key, value in data.items():
        if isinstance(value, str) and len(value) > 4000:
            result[key] = value[:4000] + "…(truncated)"
        else:
            result[key] = value
    return result
