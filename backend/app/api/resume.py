"""Resume Agent REST API."""

import uuid
import asyncio
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.agents.resume.schema import ResumeOptimizeResult, ResumeParseResult, STAROptimizeResult
from app.database.connection import get_db
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.resume_version import ResumeVersion
from app.schemas.resume import (
    ResumeDiagnoseRequest,
    ResumeOptimizeRequest,
    ResumeParseRequest,
    ResumeStarRequest,
    ResumeTaskResponse,
    ResumeVersionListItem,
)
from app.services.dev_user import get_or_create_dev_user
from app.services.file_parser import extract_text_from_bytes
from app.services.interview_service import pause_active_sessions
from app.services.resume_service import (
    format_optimize_markdown,
    format_parse_markdown,
    run_resume_diagnose,
    run_resume_optimize,
    run_resume_parse,
    run_resume_star,
)
from app.services.recommendation import persist_next_action, recommend_after_resume_optimize
from app.services.task_memory_service import create_or_update_task

router = APIRouter(prefix="/resume", tags=["resume"])


def _append_messages(
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


@router.post("/parse", response_model=ResumeTaskResponse)
async def parse_resume(body: ResumeParseRequest, db: Session = Depends(get_db)) -> ResumeTaskResponse:
    user = get_or_create_dev_user(db)
    pause_active_sessions(db, user_id=user.id, conversation_id=body.conversation_id)
    try:
        parsed, record = await run_resume_parse(
            db,
            user_id=user.id,
            resume_text=body.resume_text,
            conversation_id=body.conversation_id,
            sync_memory=body.sync_memory,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"简历解析失败: {exc}") from exc

    markdown = format_parse_markdown(parsed)
    _append_messages(
        db,
        conversation_id=body.conversation_id,
        user_id=user.id,
        user_note="【简历解析请求】",
        markdown=markdown,
    )
    return ResumeTaskResponse(
        id=record.id,
        task_type="parse",
        result=parsed.model_dump(),
        evaluation=None,
        markdown=markdown,
        created_at=record.created_at,
    )


@router.post("/parse/upload", response_model=ResumeTaskResponse)
async def parse_resume_upload(
    file: UploadFile = File(...),
    conversation_id: uuid.UUID | None = Form(default=None),
    target_position: str | None = Form(default=None),
    jd_text: str | None = Form(default=None),
    optimize: bool = Form(default=False),
    sync_memory: bool = Form(default=True),
    db: Session = Depends(get_db),
) -> ResumeTaskResponse:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="文件为空")

    try:
        resume_text = extract_text_from_bytes(file.filename or "resume.pdf", content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if len(resume_text.strip()) < 20:
        raise HTTPException(status_code=400, detail="未能从文件中提取有效简历文本")

    user = get_or_create_dev_user(db)
    pause_active_sessions(db, user_id=user.id, conversation_id=conversation_id)

    # Acceptance path: upload + target → optimize
    if optimize or target_position or jd_text:
        if not target_position and not jd_text:
            raise HTTPException(status_code=400, detail="优化模式需要提供 target_position 或 jd_text")
        try:
            result, record = await run_resume_optimize(
                db,
                user_id=user.id,
                resume_text=resume_text,
                target_position=target_position,
                jd_text=jd_text,
                conversation_id=conversation_id,
                sync_memory=sync_memory,
            )
        except asyncio.TimeoutError as exc:
            raise HTTPException(status_code=504, detail="简历优化超时，请稍后重试或先缩短简历/JD 内容") from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"简历优化失败: {exc}") from exc

        markdown = format_optimize_markdown(result)
        if result.evaluation and result.evaluation.get("risk_level") == "high":
            next_action = {
                "trigger": "resume_high_risk_blocked",
                "title": "先补齐真实事实",
                "message": "本次简历优化被真实性检查阻断。请补充真实项目、职责边界、指标口径后再优化。",
                "why": "Evaluation 检测到高风险虚构/夸大内容，不能直接用于投递。",
                "priority": "high",
                "sources": [{"type": "evaluation", "label": "Resume Evaluation 高风险"}],
            }
            completed_step = None
        else:
            next_action = recommend_after_resume_optimize(target_position=result.target_position)
            completed_step = "按JD优化"
        persist_next_action(db, user.id, next_action, conversation_id=conversation_id)
        create_or_update_task(
            db,
            user.id,
            goal=f"准备{result.target_position or target_position or '目标岗位'}简历",
            task_type="resume_prepare",
            conversation_id=conversation_id,
            completed_step=completed_step,
            next_action=next_action.get("message"),
            meta={"resume_version_id": str(record.id)},
        )
        _append_messages(
            db,
            conversation_id=conversation_id,
            user_id=user.id,
            user_note=f"【已上传简历：{file.filename or 'resume'}】目标：{target_position or '见 JD'}",
            markdown=markdown,
        )
        return ResumeTaskResponse(
            id=record.id,
            task_type="optimize",
            result=result.model_dump(exclude={"evaluation"}),
            evaluation=result.evaluation,
            markdown=markdown,
            created_at=record.created_at,
        )

    try:
        parsed, record = await run_resume_parse(
            db,
            user_id=user.id,
            resume_text=resume_text,
            conversation_id=conversation_id,
            sync_memory=sync_memory,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"简历解析失败: {exc}") from exc

    markdown = format_parse_markdown(parsed)
    _append_messages(
        db,
        conversation_id=conversation_id,
        user_id=user.id,
        user_note=f"【已上传简历：{file.filename or 'resume'}】",
        markdown=markdown,
    )
    return ResumeTaskResponse(
        id=record.id,
        task_type="parse",
        result=parsed.model_dump(),
        evaluation=None,
        markdown=markdown,
        created_at=record.created_at,
    )


@router.post("/diagnose", response_model=ResumeTaskResponse)
async def diagnose_resume(body: ResumeDiagnoseRequest, db: Session = Depends(get_db)) -> ResumeTaskResponse:
    user = get_or_create_dev_user(db)
    pause_active_sessions(db, user_id=user.id, conversation_id=body.conversation_id)
    try:
        diagnosis, record = await run_resume_diagnose(
            db,
            user_id=user.id,
            resume_text=body.resume_text,
            target_position=body.target_position,
            jd_text=body.jd_text,
            conversation_id=body.conversation_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"简历诊断失败: {exc}") from exc

    lines = [f"# 简历诊断\n\n**总分：** {diagnosis.overall_score}/100\n"]
    for p in diagnosis.problems:
        lines.append(f"- **[{p.severity}]** {p.problem} → {p.suggestion}")
    if diagnosis.strengths:
        lines.append("\n## 优势")
        lines.extend([f"- {s}" for s in diagnosis.strengths])
    if diagnosis.missing_information:
        lines.append("\n## 待补充")
        lines.extend([f"- {m}" for m in diagnosis.missing_information])
    markdown = "\n".join(lines)

    _append_messages(
        db,
        conversation_id=body.conversation_id,
        user_id=user.id,
        user_note="【简历诊断请求】",
        markdown=markdown,
    )
    return ResumeTaskResponse(
        id=record.id,
        task_type="diagnose",
        result=diagnosis.model_dump(),
        evaluation=None,
        markdown=markdown,
        created_at=record.created_at,
    )


@router.post("/star", response_model=ResumeTaskResponse)
async def star_resume(body: ResumeStarRequest, db: Session = Depends(get_db)) -> ResumeTaskResponse:
    if not body.project_text and not body.resume_text:
        raise HTTPException(status_code=400, detail="请提供 project_text 或 resume_text")

    user = get_or_create_dev_user(db)
    pause_active_sessions(db, user_id=user.id, conversation_id=body.conversation_id)
    try:
        star, record, evaluation = await run_resume_star(
            db,
            user_id=user.id,
            project_text=body.project_text,
            resume_text=body.resume_text,
            conversation_id=body.conversation_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"STAR 生成失败: {exc}") from exc

    lines = ["# STAR 项目经历优化", ""]
    for item in star.items:
        lines.append(f"## {item.project_name or '项目'}")
        for label, val in [
            ("Situation", item.situation),
            ("Task", item.task),
            ("Action", item.action),
            ("Result", item.result),
        ]:
            if val:
                lines.append(f"- **{label}：** {val}")
        if item.bullet:
            lines.append(f"- **要点：** {item.bullet}")
        if item.missing_information:
            lines.append(f"- **待补充：** {', '.join(item.missing_information)}")
        lines.append("")
    if evaluation:
        lines.append(f"## 真实性检查\n- 风险：{evaluation.get('risk_level')}")
        if evaluation.get("fabricated_claims"):
            lines.extend([f"- 疑似虚构：{c}" for c in evaluation["fabricated_claims"]])
    markdown = "\n".join(lines)

    _append_messages(
        db,
        conversation_id=body.conversation_id,
        user_id=user.id,
        user_note="【STAR 优化请求】",
        markdown=markdown,
    )
    return ResumeTaskResponse(
        id=record.id,
        task_type="star",
        result=star.model_dump(),
        evaluation=evaluation,
        markdown=markdown,
        created_at=record.created_at,
    )


@router.post("/optimize", response_model=ResumeTaskResponse)
async def optimize_resume(body: ResumeOptimizeRequest, db: Session = Depends(get_db)) -> ResumeTaskResponse:
    if not body.target_position and not body.jd_text:
        raise HTTPException(status_code=400, detail="请提供 target_position 或 jd_text")

    user = get_or_create_dev_user(db)
    pause_active_sessions(db, user_id=user.id, conversation_id=body.conversation_id)
    try:
        result, record = await run_resume_optimize(
            db,
            user_id=user.id,
            resume_text=body.resume_text,
            target_position=body.target_position,
            jd_text=body.jd_text,
            conversation_id=body.conversation_id,
            sync_memory=body.sync_memory,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="简历优化超时，请稍后重试或先缩短简历/JD 内容") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"简历优化失败: {exc}") from exc

    markdown = format_optimize_markdown(result)
    if result.evaluation and result.evaluation.get("risk_level") == "high":
        next_action = {
            "trigger": "resume_high_risk_blocked",
            "title": "先补齐真实事实",
            "message": "本次简历优化被真实性检查阻断。请补充真实项目、职责边界、指标口径后再优化。",
            "why": "Evaluation 检测到高风险虚构/夸大内容，不能直接用于投递。",
            "priority": "high",
            "sources": [{"type": "evaluation", "label": "Resume Evaluation 高风险"}],
        }
        completed_step = None
    else:
        next_action = recommend_after_resume_optimize(target_position=result.target_position)
        completed_step = "按JD优化"
    persist_next_action(db, user.id, next_action, conversation_id=body.conversation_id)
    create_or_update_task(
        db,
        user.id,
        goal=f"准备{result.target_position or body.target_position or '目标岗位'}简历",
        task_type="resume_prepare",
        conversation_id=body.conversation_id,
        completed_step=completed_step,
        next_action=next_action.get("message"),
        meta={"resume_version_id": str(record.id)},
    )
    _append_messages(
        db,
        conversation_id=body.conversation_id,
        user_id=user.id,
        user_note=f"【简历优化】目标：{body.target_position or '见 JD'}",
        markdown=markdown,
    )
    return ResumeTaskResponse(
        id=record.id,
        task_type="optimize",
        result=result.model_dump(exclude={"evaluation"}),
        evaluation=result.evaluation,
        markdown=markdown,
        created_at=record.created_at,
    )


@router.get("/versions", response_model=list[ResumeVersionListItem])
def list_versions(db: Session = Depends(get_db), limit: int = 20) -> list[ResumeVersionListItem]:
    user = get_or_create_dev_user(db)
    rows = (
        db.query(ResumeVersion)
        .filter(ResumeVersion.user_id == user.id)
        .order_by(ResumeVersion.created_at.desc())
        .limit(min(limit, 50))
        .all()
    )
    return [ResumeVersionListItem.model_validate(r) for r in rows]


@router.get("/versions/{version_id}", response_model=ResumeTaskResponse)
def get_version(version_id: uuid.UUID, db: Session = Depends(get_db)) -> ResumeTaskResponse:
    user = get_or_create_dev_user(db)
    record = (
        db.query(ResumeVersion)
        .filter(ResumeVersion.id == version_id, ResumeVersion.user_id == user.id)
        .first()
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Resume version not found")

    result = record.result_json or {}
    evaluation = record.evaluation_json
    if record.task_type == "optimize":
        optimized = ResumeOptimizeResult.model_validate({**result, "evaluation": evaluation})
        markdown = format_optimize_markdown(optimized)
    elif record.task_type == "parse":
        markdown = format_parse_markdown(ResumeParseResult.model_validate(result))
    elif record.task_type == "star":
        star = STAROptimizeResult.model_validate(result)
        markdown = "# STAR\n\n" + "\n".join(
            f"- {i.project_name}: {i.bullet or ''}" for i in star.items
        )
    else:
        markdown = f"# {record.task_type}\n\n```json\n{result}\n```"

    return ResumeTaskResponse(
        id=record.id,
        task_type=record.task_type,
        result=result,
        evaluation=evaluation,
        markdown=markdown,
        created_at=record.created_at,
    )
