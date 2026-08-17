"""Job Intelligence REST API."""

import uuid
import asyncio
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.models.career_gap import CareerGap
from app.models.conversation import Conversation
from app.models.job_analysis import JobAnalysis
from app.models.message import Message
from app.schemas.job import JobAnalysisListItem, JobAnalyzeRequest, JobAnalyzeResponse
from app.services.dev_user import get_or_create_dev_user
from app.services.document_kind import detect_document_kind
from app.services.file_parser import extract_text_from_bytes
from app.services.interview_service import pause_active_sessions
from app.services.job_service import format_analysis_markdown, run_job_analysis
from app.services.recommendation import persist_next_action, recommend_after_job_analysis
from app.services.task_memory_service import create_or_update_task

router = APIRouter(prefix="/job", tags=["job"])


def _append_analysis_messages(
    db: Session,
    *,
    conversation_id: uuid.UUID | None,
    user_id: uuid.UUID,
    user_note: str,
    markdown: str,
) -> None:
    if conversation_id is None:
        return
    conversation = (
        db.query(Conversation)
        .filter(Conversation.id == conversation_id, Conversation.user_id == user_id)
        .first()
    )
    if conversation is None:
        return
    db.add(Message(conversation_id=conversation_id, role="user", content=user_note))
    db.add(Message(conversation_id=conversation_id, role="assistant", content=markdown))
    conversation.updated_at = datetime.utcnow()
    db.commit()


def _next_action_from_analysis(analysis, career_gap=None):
    gaps = (
        [g.title for g in career_gap.gaps]
        if career_gap and career_gap.gaps
        else list(analysis.user_match.gaps or []) if analysis.user_match else []
    )
    next_action = recommend_after_job_analysis(
        position=analysis.position_overview.position,
        company=analysis.position_overview.company,
        match_gaps=gaps,
        external_sources=list(analysis.company_analysis.sources or []) if analysis.company_analysis else [],
    )
    if career_gap and career_gap.recommendations:
        next_action = {
            **next_action,
            "why": career_gap.recommendations[0].why or next_action.get("why"),
            "priority": career_gap.recommendations[0].priority,
            "sources": (next_action.get("sources") or [])
            + [{"type": "gap", "label": "Career Gap Analysis"}],
        }
    return next_action


@router.post("/analyze", response_model=JobAnalyzeResponse)
async def analyze_job(body: JobAnalyzeRequest, db: Session = Depends(get_db)) -> JobAnalyzeResponse:
    if not body.jd_text and not (body.position or body.company):
        raise HTTPException(status_code=400, detail="请提供 jd_text，或 position/company")

    user = get_or_create_dev_user(db)
    pause_active_sessions(db, user_id=user.id, conversation_id=body.conversation_id)
    input_type = "jd_text" if body.jd_text else "position_company"

    try:
        analysis, record, gap = await run_job_analysis(
            db,
            user_id=user.id,
            jd_text=body.jd_text,
            position=body.position,
            company=body.company,
            input_type=input_type,
            conversation_id=body.conversation_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="岗位分析超时，请稍后重试或缩短 JD 内容") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"分析失败: {exc}") from exc

    markdown = format_analysis_markdown(analysis, career_gap=gap)
    next_action = _next_action_from_analysis(analysis, gap)
    persist_next_action(db, user.id, next_action, conversation_id=body.conversation_id)
    create_or_update_task(
        db,
        user.id,
        goal=f"准备{analysis.position_overview.company or ''}{analysis.position_overview.position or '目标'}岗位",
        task_type="jd_analysis",
        conversation_id=body.conversation_id,
        completed_step="完成岗位分析",
        next_action=next_action.get("message"),
        meta={"job_analysis_id": str(record.id)},
    )
    note = "请分析以下岗位信息" if not body.jd_text else "请分析以下 JD"
    _append_analysis_messages(
        db,
        conversation_id=body.conversation_id,
        user_id=user.id,
        user_note=f"【JD 分析请求】{note}",
        markdown=markdown,
    )

    return JobAnalyzeResponse(
        id=record.id,
        analysis=analysis.model_dump(exclude={"evaluation"}),
        evaluation=analysis.evaluation,
        career_gap=gap.model_dump() if gap else None,
        markdown=markdown,
        created_at=record.created_at,
    )


@router.post("/analyze/upload", response_model=JobAnalyzeResponse)
async def analyze_job_upload(
    file: UploadFile = File(...),
    conversation_id: uuid.UUID | None = Form(default=None),
    position: str | None = Form(default=None),
    company: str | None = Form(default=None),
    db: Session = Depends(get_db),
) -> JobAnalyzeResponse:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="文件为空")

    try:
        jd_text = extract_text_from_bytes(file.filename or "upload.txt", content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if len(jd_text.strip()) < 20:
        raise HTTPException(status_code=400, detail="未能从文件中提取有效 JD 文本")

    kind = detect_document_kind(jd_text)
    if kind == "resume":
        raise HTTPException(
            status_code=400,
            detail={
                "code": "LOOKS_LIKE_RESUME",
                "message": "检测到这是一份简历，不是岗位 JD。请改用「上传简历」按钮（文档图标）。",
            },
        )

    user = get_or_create_dev_user(db)
    pause_active_sessions(db, user_id=user.id, conversation_id=conversation_id)
    try:
        analysis, record, gap = await run_job_analysis(
            db,
            user_id=user.id,
            jd_text=jd_text,
            position=position,
            company=company,
            input_type="jd_file",
            conversation_id=conversation_id,
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="岗位分析超时，请稍后重试或缩短 JD 内容") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"分析失败: {exc}") from exc

    markdown = format_analysis_markdown(analysis, career_gap=gap)
    next_action = _next_action_from_analysis(analysis, gap)
    persist_next_action(db, user.id, next_action, conversation_id=conversation_id)
    create_or_update_task(
        db,
        user.id,
        goal=f"准备{analysis.position_overview.company or ''}{analysis.position_overview.position or '目标'}岗位",
        task_type="jd_analysis",
        conversation_id=conversation_id,
        completed_step="完成岗位分析",
        next_action=next_action.get("message"),
        meta={"job_analysis_id": str(record.id)},
    )
    _append_analysis_messages(
        db,
        conversation_id=conversation_id,
        user_id=user.id,
        user_note=f"【已上传 JD 文件：{file.filename or 'upload'}】",
        markdown=markdown,
    )

    return JobAnalyzeResponse(
        id=record.id,
        analysis=analysis.model_dump(exclude={"evaluation"}),
        evaluation=analysis.evaluation,
        career_gap=gap.model_dump() if gap else None,
        markdown=markdown,
        created_at=record.created_at,
    )


@router.get("/analyses", response_model=list[JobAnalysisListItem])
def list_analyses(db: Session = Depends(get_db), limit: int = 20) -> list[JobAnalysisListItem]:
    user = get_or_create_dev_user(db)
    rows = (
        db.query(JobAnalysis)
        .filter(JobAnalysis.user_id == user.id)
        .order_by(JobAnalysis.created_at.desc())
        .limit(min(limit, 50))
        .all()
    )
    return [JobAnalysisListItem.model_validate(r) for r in rows]


@router.get("/analyses/{analysis_id}", response_model=JobAnalyzeResponse)
def get_analysis(analysis_id: uuid.UUID, db: Session = Depends(get_db)) -> JobAnalyzeResponse:
    user = get_or_create_dev_user(db)
    record = (
        db.query(JobAnalysis)
        .filter(JobAnalysis.id == analysis_id, JobAnalysis.user_id == user.id)
        .first()
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Analysis not found")

    from app.agents.career_gap.schema import CareerGapResult
    from app.agents.job.schema import JobAnalysisResult

    analysis = JobAnalysisResult.model_validate(record.result_json or {})
    analysis.evaluation = record.evaluation_json
    gap_row = (
        db.query(CareerGap)
        .filter(CareerGap.jd_id == record.id, CareerGap.user_id == user.id)
        .order_by(CareerGap.created_at.desc())
        .first()
    )
    gap = None
    if gap_row and gap_row.result_json:
        try:
            gap = CareerGapResult.model_validate(gap_row.result_json)
        except Exception:  # noqa: BLE001
            gap = None

    return JobAnalyzeResponse(
        id=record.id,
        analysis=analysis.model_dump(exclude={"evaluation"}),
        evaluation=record.evaluation_json,
        career_gap=gap.model_dump() if gap else None,
        markdown=format_analysis_markdown(analysis, career_gap=gap),
        created_at=record.created_at,
    )
