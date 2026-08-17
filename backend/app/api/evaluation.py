"""Evaluation QC REST API — records, bad cases, prompts, traces, datasets, dashboard."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.agents.evaluation.agent import EvaluationAgent
from app.database.connection import get_db
from app.evaluation.dataset_runner import list_datasets, run_dataset
from app.evaluation.service import (
    create_bad_case,
    get_dashboard_metrics,
    list_bad_cases,
    list_evaluation_records,
    save_evaluation_record,
    update_bad_case,
)
from app.evaluation.trace import list_trace_runs
from app.schemas.evaluation import (
    BadCaseCreateRequest,
    BadCaseItem,
    BadCaseUpdateRequest,
    DatasetInfo,
    DatasetRunRequest,
    EvaluateRequest,
    EvaluationRecordItem,
    PromptCreateRequest,
    PromptDetailItem,
    PromptTemplateItem,
    TraceDetailResponse,
    TraceRunItem,
)
from app.services.dev_user import get_or_create_dev_user
from app.services.prompt_loader import set_active_prompt_override
from app.services.prompt_service import (
    activate_prompt,
    create_prompt_version,
    ensure_prompts_seeded,
    list_prompts,
    seed_prompts_from_files,
)

router = APIRouter(prefix="/evaluation", tags=["evaluation"])


@router.get("/dashboard")
def dashboard(days: int = Query(default=30, ge=1, le=365), db: Session = Depends(get_db)) -> dict:
    user = get_or_create_dev_user(db)
    return get_dashboard_metrics(db, days=days, user_id=user.id)


@router.get("/records", response_model=list[EvaluationRecordItem])
def get_records(
    agent_name: str | None = None,
    risk_level: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> list[EvaluationRecordItem]:
    user = get_or_create_dev_user(db)
    rows = list_evaluation_records(
        db,
        user_id=user.id,
        agent_name=agent_name,
        risk_level=risk_level,
        limit=limit,
    )
    return [
        EvaluationRecordItem(
            id=r.id,
            agent_name=r.agent_name,
            task_type=r.task_type,
            score=r.score,
            risk_level=r.risk_level,
            feedback=r.feedback,
            trace_id=r.trace_id,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.get("/bad-cases", response_model=list[BadCaseItem])
def get_bad_cases(
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> list[BadCaseItem]:
    user = get_or_create_dev_user(db)
    rows = list_bad_cases(db, user_id=user.id, status=status, limit=limit)
    return [
        BadCaseItem(
            id=c.id,
            agent_name=c.agent_name,
            problem_type=c.problem_type,
            description=c.description,
            solution=c.solution,
            status=c.status,
            evaluation_record_id=c.evaluation_record_id,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in rows
    ]


@router.post("/bad-cases", response_model=BadCaseItem)
def post_bad_case(body: BadCaseCreateRequest, db: Session = Depends(get_db)) -> BadCaseItem:
    user = get_or_create_dev_user(db)
    case = create_bad_case(
        db,
        agent_name=body.agent_name,
        problem_type=body.problem_type,
        description=body.description,
        solution=body.solution,
        user_id=user.id,
    )
    return BadCaseItem(
        id=case.id,
        agent_name=case.agent_name,
        problem_type=case.problem_type,
        description=case.description,
        solution=case.solution,
        status=case.status,
        evaluation_record_id=case.evaluation_record_id,
        created_at=case.created_at,
        updated_at=case.updated_at,
    )


@router.patch("/bad-cases/{case_id}", response_model=BadCaseItem)
def patch_bad_case(
    case_id: uuid.UUID,
    body: BadCaseUpdateRequest,
    db: Session = Depends(get_db),
) -> BadCaseItem:
    case = update_bad_case(db, case_id, status=body.status, solution=body.solution)
    if case is None:
        raise HTTPException(status_code=404, detail="Bad case not found")
    return BadCaseItem(
        id=case.id,
        agent_name=case.agent_name,
        problem_type=case.problem_type,
        description=case.description,
        solution=case.solution,
        status=case.status,
        evaluation_record_id=case.evaluation_record_id,
        created_at=case.created_at,
        updated_at=case.updated_at,
    )


@router.get("/prompts", response_model=list[PromptTemplateItem])
def get_prompts(
    agent_name: str | None = None,
    full: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> list[PromptTemplateItem]:
    # Auto-import built-in prompt.md so the dashboard always shows internal prompts
    rows = ensure_prompts_seeded(db)
    if agent_name:
        rows = [p for p in rows if p.agent_name == agent_name]
    for row in rows:
        if row.status == "active":
            set_active_prompt_override(row.agent_name, row.prompt_content)
    return [
        PromptTemplateItem(
            id=p.id,
            agent_name=p.agent_name,
            version=p.version,
            status=p.status,
            created_at=p.created_at,
            content_preview=(p.prompt_content[:200] + "…") if len(p.prompt_content) > 200 else p.prompt_content,
            content=p.prompt_content if full else None,
        )
        for p in rows
    ]


@router.get("/prompts/{prompt_id}", response_model=PromptDetailItem)
def get_prompt_detail(prompt_id: uuid.UUID, db: Session = Depends(get_db)) -> PromptDetailItem:
    ensure_prompts_seeded(db)
    rows = list_prompts(db)
    row = next((p for p in rows if p.id == prompt_id), None)
    if row is None:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return PromptDetailItem(
        id=row.id,
        agent_name=row.agent_name,
        version=row.version,
        status=row.status,
        created_at=row.created_at,
        content=row.prompt_content,
    )


@router.post("/prompts", response_model=PromptTemplateItem)
def post_prompt(body: PromptCreateRequest, db: Session = Depends(get_db)) -> PromptTemplateItem:
    row = create_prompt_version(
        db,
        agent_name=body.agent_name,
        version=body.version,
        content=body.content,
        activate=body.activate,
    )
    if body.activate:
        set_active_prompt_override(body.agent_name, body.content)
    return PromptTemplateItem(
        id=row.id,
        agent_name=row.agent_name,
        version=row.version,
        status=row.status,
        created_at=row.created_at,
        content_preview=(row.prompt_content[:200] + "…") if len(row.prompt_content) > 200 else row.prompt_content,
    )


@router.post("/prompts/seed")
def post_seed_prompts(db: Session = Depends(get_db)) -> dict:
    created = seed_prompts_from_files(db)
    for row in list_prompts(db):
        if row.status == "active":
            set_active_prompt_override(row.agent_name, row.prompt_content)
    return {"seeded": len(created), "ids": [str(c.id) for c in created]}


@router.post("/prompts/{prompt_id}/activate", response_model=PromptTemplateItem)
def post_activate_prompt(prompt_id: uuid.UUID, db: Session = Depends(get_db)) -> PromptTemplateItem:
    row = activate_prompt(db, prompt_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Prompt not found")
    set_active_prompt_override(row.agent_name, row.prompt_content)
    return PromptTemplateItem(
        id=row.id,
        agent_name=row.agent_name,
        version=row.version,
        status=row.status,
        created_at=row.created_at,
        content_preview=(row.prompt_content[:200] + "…") if len(row.prompt_content) > 200 else row.prompt_content,
    )

@router.get("/traces/{trace_id}", response_model=TraceDetailResponse)
def get_trace(trace_id: uuid.UUID, db: Session = Depends(get_db)) -> TraceDetailResponse:
    runs = list_trace_runs(db, trace_id)
    return TraceDetailResponse(
        trace_id=trace_id,
        runs=[
            TraceRunItem(
                id=r.id,
                agent_name=r.agent_name,
                task_type=r.task_type,
                status=r.status,
                duration_ms=r.duration_ms,
                parent_run_id=r.parent_run_id,
                created_at=r.created_at,
            )
            for r in runs
        ],
    )


@router.get("/datasets", response_model=list[DatasetInfo])
def get_datasets() -> list[DatasetInfo]:
    return [DatasetInfo(**d) for d in list_datasets()]


@router.post("/datasets/{dataset_id}/run")
async def post_run_dataset(
    dataset_id: str,
    body: DatasetRunRequest | None = None,
) -> dict:
    try:
        return await run_dataset(dataset_id, limit=body.limit if body else None)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/check")
async def post_evaluate(body: EvaluateRequest, db: Session = Depends(get_db)) -> dict:
    """Manual Evaluation check — useful for QA / dataset debugging."""
    user = get_or_create_dev_user(db)
    agent = EvaluationAgent()
    payload = body.model_dump(exclude_none=True)
    result = await agent.run(payload)
    record = save_evaluation_record(
        db,
        agent_name=body.kind,
        task_type=body.task or body.kind,
        evaluation=result,
        input_data=payload,
        output_data=result,
        user_id=user.id,
    )
    return {"evaluation": result, "record_id": str(record.id)}
