"""Resume Agent orchestration: parse / diagnose / STAR / JD-tailored optimize."""

from __future__ import annotations

import asyncio
import re
import uuid
from typing import Literal

from sqlalchemy.orm import Session

from app.agents.evaluation.agent import EvaluationAgent
from app.agents.resume.agent import ResumeAgent
from app.agents.resume.schema import (
    ResumeDiagnosisResult,
    ResumeOptimizeResult,
    ResumeParseResult,
    STAROptimizeResult,
)
from app.evaluation import finish_run, new_trace, save_evaluation_record, traced_run
from app.config import settings
from app.memory.service import (
    build_constraint_memory_context,
    build_memory_context,
    get_or_create_profile,
)
from app.models.experience import Experience
from app.models.project import Project
from app.models.resume_version import ResumeVersion
from app.models.skill import Skill
from app.services.recommendation import format_recommendation_markdown, recommend_after_resume_optimize

TaskType = Literal["parse", "diagnose", "star", "optimize"]


async def run_resume_parse(
    db: Session,
    *,
    user_id: uuid.UUID,
    resume_text: str,
    conversation_id: uuid.UUID | None = None,
    sync_memory: bool = True,
) -> tuple[ResumeParseResult, ResumeVersion]:
    memory_context = build_memory_context(db, user_id)
    parsed = await ResumeAgent().parse(resume_text, memory_context=memory_context)

    if sync_memory:
        _sync_parse_to_memory(db, user_id, parsed)

    record = _save_record(
        db,
        user_id=user_id,
        conversation_id=conversation_id,
        task_type="parse",
        source_text=resume_text,
        result=parsed.model_dump(),
        evaluation=None,
    )
    return parsed, record


async def run_resume_diagnose(
    db: Session,
    *,
    user_id: uuid.UUID,
    resume_text: str,
    target_position: str | None = None,
    jd_text: str | None = None,
    conversation_id: uuid.UUID | None = None,
) -> tuple[ResumeDiagnosisResult, ResumeVersion]:
    memory_context = build_memory_context(db, user_id)
    agent = ResumeAgent()
    parsed = await agent.parse(resume_text, memory_context=memory_context)
    diagnosis = await agent.diagnose(
        resume_text=resume_text,
        parsed=parsed,
        target_position=target_position,
        jd_text=jd_text,
        memory_context=memory_context,
    )
    record = _save_record(
        db,
        user_id=user_id,
        conversation_id=conversation_id,
        task_type="diagnose",
        source_text=resume_text,
        target_position=target_position,
        jd_text=jd_text,
        result=diagnosis.model_dump(),
        evaluation=None,
    )
    return diagnosis, record


async def run_resume_star(
    db: Session,
    *,
    user_id: uuid.UUID,
    project_text: str | None = None,
    resume_text: str | None = None,
    conversation_id: uuid.UUID | None = None,
) -> tuple[STAROptimizeResult, ResumeVersion, dict]:
    # STAR rewrite must not import unrelated Career Memory experiences.
    memory_context = build_constraint_memory_context(db, user_id)
    source = project_text or resume_text or ""
    ctx = new_trace(user_id=user_id, conversation_id=conversation_id)

    async with traced_run(
        db,
        ctx,
        agent_name="resume",
        task_type="star",
        input_data={"source_len": len(source)},
    ) as resume_run:
        star = await ResumeAgent().optimize_star(
            project_text=project_text,
            resume_text=resume_text,
            memory_context=memory_context,
        )
        finish_run(db, resume_run, star.model_dump())

    async with traced_run(
        db,
        ctx,
        agent_name="evaluation",
        task_type="star",
        input_data={"agent": "resume"},
    ) as eval_run:
        evaluation = await EvaluationAgent().evaluate_star(star, source_text=source)
        finish_run(db, eval_run, evaluation.model_dump())

    save_evaluation_record(
        db,
        agent_name="resume",
        task_type="star",
        evaluation=evaluation,
        input_data={"source_text": source[:2000]},
        output_data=star.model_dump(),
        user_id=user_id,
        conversation_id=conversation_id,
        trace_id=ctx.trace_id,
    )
    record = _save_record(
        db,
        user_id=user_id,
        conversation_id=conversation_id,
        task_type="star",
        source_text=source,
        result=star.model_dump(),
        evaluation=evaluation.model_dump(),
    )
    return star, record, evaluation.model_dump()


async def run_resume_optimize(
    db: Session,
    *,
    user_id: uuid.UUID,
    resume_text: str,
    target_position: str | None = None,
    jd_text: str | None = None,
    conversation_id: uuid.UUID | None = None,
    sync_memory: bool = True,
) -> tuple[ResumeOptimizeResult, ResumeVersion]:
    """Full pipeline: parse → diagnose → optimize → Evaluation."""
    if not target_position and not jd_text:
        raise ValueError("请提供目标岗位或目标 JD")

    # Optimize: resume_text is sole fact source; never feed full Career Memory into parse/diagnose/optimize
    # (avoids prior resumes bleeding into diagnosis strengths / STAR).
    constraint_context = build_constraint_memory_context(db, user_id)
    agent = ResumeAgent()
    ctx = new_trace(user_id=user_id, conversation_id=conversation_id)

    async with traced_run(
        db,
        ctx,
        agent_name="resume",
        task_type="optimize",
        input_data={"target_position": target_position, "has_jd": bool(jd_text)},
    ) as resume_run:
        parsed = await asyncio.wait_for(
            agent.parse(resume_text, memory_context=constraint_context),
            timeout=settings.agent_task_timeout_seconds,
        )
        if sync_memory:
            _sync_parse_to_memory(db, user_id, parsed)

        diagnosis = await asyncio.wait_for(
            agent.diagnose(
                resume_text=resume_text,
                parsed=parsed,
                target_position=target_position,
                jd_text=jd_text,
                memory_context=constraint_context,
            ),
            timeout=settings.agent_task_timeout_seconds,
        )

        optimized = await asyncio.wait_for(
            agent.optimize(
                resume_text=resume_text,
                target_position=target_position,
                jd_text=jd_text,
                memory_context=constraint_context,
            ),
            timeout=settings.agent_task_timeout_seconds,
        )
        optimized.diagnosis = diagnosis

        # If STAR projects empty, try generating from parsed projects
        if not optimized.star_projects and parsed.projects:
            project_blob = "\n\n".join(
                [
                    f"项目：{p.project_name or ''}\n角色：{p.role or ''}\n"
                    f"背景：{p.background or ''}\n行动：{p.action or ''}\n结果：{p.result or ''}"
                    for p in parsed.projects
                ]
            )
            star = await asyncio.wait_for(
                agent.optimize_star(project_text=project_blob, memory_context=constraint_context),
                timeout=settings.agent_task_timeout_seconds,
            )
            optimized.star_projects = star.items

        finish_run(db, resume_run, optimized.model_dump(exclude={"evaluation"}))

    async with traced_run(
        db,
        ctx,
        agent_name="evaluation",
        task_type="optimize",
        input_data={"agent": "resume"},
    ) as eval_run:
        evaluation = await asyncio.wait_for(
            EvaluationAgent().evaluate_resume_optimize(
                optimized,
                resume_text=resume_text,
                jd_text=jd_text,
                target_position=target_position,
            ),
            timeout=settings.agent_task_timeout_seconds,
        )
        finish_run(db, eval_run, evaluation.model_dump())

    optimized.evaluation = evaluation.model_dump()
    save_evaluation_record(
        db,
        agent_name="resume",
        task_type="optimize",
        evaluation=evaluation,
        input_data={
            "resume_text": resume_text[:2000],
            "target_position": target_position,
            "jd_text": (jd_text or "")[:2000],
        },
        output_data=optimized.model_dump(exclude={"evaluation"}),
        user_id=user_id,
        conversation_id=conversation_id,
        trace_id=ctx.trace_id,
    )

    # Block deliverable text on high risk, or medium risk with fabricated claims / constraint conflict.
    should_block = evaluation.risk_level == "high" or (
        bool(evaluation.fabricated_claims)
        and evaluation.risk_level == "medium"
        and any(
            k in (constraint_context + " ".join(evaluation.fabricated_claims)).lower()
            for k in ("rag", "约束", "没有真实", "虚构", "夸大")
        )
    )
    if should_block:
        optimized.optimized_resume = (
            "【不可投递】本次简历优化未生成可直接使用版本：Evaluation 检测到高风险虚构或夸大内容。"
            "请先补充可验证事实（真实公司/项目/指标/职责），系统会基于真实材料重新优化。"
        )
        optimized.change_reasons = []
        optimized.star_projects = []
        optimized.missing_information = list(
            dict.fromkeys(
                optimized.missing_information
                + ["已阻断高风险优化结果：不要直接投递本次生成内容"]
                + evaluation.fabricated_claims
            )
        )

    record = _save_record(
        db,
        user_id=user_id,
        conversation_id=conversation_id,
        task_type="optimize",
        source_text=resume_text,
        target_position=target_position or optimized.target_position,
        jd_text=jd_text,
        result=optimized.model_dump(exclude={"evaluation"}),
        evaluation=evaluation.model_dump(),
    )
    return optimized, record


def format_optimize_markdown(result: ResumeOptimizeResult) -> str:
    ev = result.evaluation or {}
    claims = ev.get("fabricated_claims") or []
    is_blocked = bool(
        ev.get("risk_level") == "high"
        or (
            result.optimized_resume
            and ("【不可投递】" in result.optimized_resume or "未生成可直接使用版本" in result.optimized_resume)
        )
        or (ev.get("risk_level") == "medium" and claims)
    )
    if is_blocked:
        lines = [
            "# 简历优化报告",
            "",
            "> **状态：不可投递（已阻断）**",
            "",
            f"**目标岗位：** {result.target_position or '未指定'}",
            "",
            "## 结果状态",
            "",
            "本次优化结果已被真实性检查阻断，**不提供可直接投递的改写简历**。",
            "",
            "## 阻断原因",
            f"- **风险等级：** {ev.get('risk_level', 'high')}",
            f"- **质量分：** {ev.get('score', '—')}",
        ]
        for key, title in [
            ("problems", "主要问题"),
            ("fabricated_claims", "疑似虚构/夸大内容"),
            ("suggestions", "修复建议"),
        ]:
            items = ev.get(key) or []
            if items:
                lines.append(f"### {title}")
                lines.extend([f"- {x}" for x in items])
        if result.diagnosis:
            lines.extend(["", "## 可保留的诊断", f"**诊断分：** {result.diagnosis.overall_score}/100"])
            for p in result.diagnosis.problems:
                lines.append(f"- **[{p.severity}]** {p.problem} → {p.suggestion}")
        lines.extend(
            [
                "",
                "## 下一步",
                "- 补充真实项目名称、职责边界、指标口径和数据来源。",
                "- 对没有事实依据的 AI/RAG/Prompt/Agent 经历先标记为「待补充」，不要写入简历。",
                "- 补齐事实后重新发起简历优化。",
            ]
        )
        return "\n".join(lines)

    lines = [
        "# 简历优化报告",
        "",
        f"**目标岗位：** {result.target_position or '未指定'}",
        "",
        "## 优化后的简历",
        "",
        result.optimized_resume or "（空）",
        "",
        "## 修改原因",
    ]
    if result.change_reasons:
        for i, item in enumerate(result.change_reasons, 1):
            lines.append(f"### {i}. {item.reason}")
            if item.original:
                lines.append(f"- **原文：** {item.original}")
            if item.revised:
                lines.append(f"- **改写：** {item.revised}")
    else:
        lines.append("- （未提供逐条修改说明）")

    if result.diagnosis:
        lines.extend(["", "## 简历诊断", f"**总分：** {result.diagnosis.overall_score}/100"])
        if result.diagnosis.strengths:
            lines.append("### 优势")
            lines.extend([f"- {s}" for s in result.diagnosis.strengths])
        if result.diagnosis.problems:
            lines.append("### 问题与建议")
            for p in result.diagnosis.problems:
                lines.append(f"- **[{p.severity}]** {p.problem} → {p.suggestion}")

    if result.star_projects:
        lines.extend(["", "## STAR 项目经历"])
        for item in result.star_projects:
            lines.append(f"### {item.project_name or '项目'}")
            if item.situation:
                lines.append(f"- **Situation：** {item.situation}")
            if item.task:
                lines.append(f"- **Task：** {item.task}")
            if item.action:
                lines.append(f"- **Action：** {item.action}")
            if item.result:
                lines.append(f"- **Result：** {item.result}")
            if item.bullet:
                lines.append(f"- **要点：** {item.bullet}")
            if item.missing_information:
                lines.append(f"- **待补充：** {', '.join(item.missing_information)}")

    if result.missing_information:
        lines.extend(["", "## 待补充信息"])
        lines.extend([f"- {m}" for m in result.missing_information])

    if result.evaluation:
        ev = result.evaluation
        lines.extend(
            [
                "",
                "## 真实性检查（Evaluation）",
                f"- **风险等级：** {ev.get('risk_level', 'unknown')}",
                f"- **质量分：** {ev.get('score', '—')}",
            ]
        )
        for key, title in [
            ("problems", "问题"),
            ("fabricated_claims", "疑似虚构"),
            ("suggestions", "建议"),
        ]:
            items = ev.get(key) or []
            if items:
                lines.append(f"- **{title}：**")
                lines.extend([f"  - {x}" for x in items])

    lines.append(
        format_recommendation_markdown(
            recommend_after_resume_optimize(target_position=result.target_position)
        )
    )

    return "\n".join(lines)


def format_parse_markdown(parsed: ResumeParseResult) -> str:
    lines = ["# 简历解析结果", ""]
    if parsed.summary:
        lines.append(f"**摘要：** {parsed.summary}")
    if parsed.experiences:
        lines.extend(["", "## 工作经历"])
        for exp in parsed.experiences:
            lines.append(
                f"- {exp.position or '职位'} @ {exp.company or '公司'}"
                + (f"（{exp.duration}）" if exp.duration else "")
            )
            if exp.responsibility:
                lines.append(f"  - 职责：{exp.responsibility}")
            if exp.achievement:
                lines.append(f"  - 成果：{exp.achievement}")
    if parsed.projects:
        lines.extend(["", "## 项目经历"])
        for p in parsed.projects:
            lines.append(f"- **{p.project_name or '项目'}**" + (f" · {p.role}" if p.role else ""))
            for label, val in [("背景", p.background), ("行动", p.action), ("结果", p.result)]:
                if val:
                    lines.append(f"  - {label}：{val}")
    if parsed.skills:
        lines.extend(["", "## 技能"])
        lines.extend([f"- {s.skill_name}" + (f"（{s.level}）" if s.level else "") for s in parsed.skills])
    if parsed.missing_information:
        lines.extend(["", "## 待补充"])
        lines.extend([f"- {m}" for m in parsed.missing_information])
    return "\n".join(lines)


def looks_like_resume(text: str) -> bool:
    lowered = text.lower()
    keywords = ["工作经历", "项目经历", "教育经历", "自我评价", "简历", "resume", "experience", "education", "skills"]
    if any(k in lowered for k in keywords) and len(text) >= 120:
        return True
    return len(text) >= 400 and ("公司" in text or "项目" in text)


def extract_resume_intent_params(text: str) -> dict[str, str | None]:
    """Extract target_position / jd hints from resume-related user message."""
    target = None
    m = re.search(r"(?:目标岗位|目标职位|投递|应聘)[:：]?\s*([^\n,，。]+)", text)
    if m:
        target = m.group(1).strip()
    else:
        m = re.search(r"(?:优化|定制|改)(?:一下)?(?:我的)?简历.*?([^\n，。]{2,20}?(?:产品经理|工程师|设计师|运营|分析师))", text)
        if m:
            target = m.group(1).strip()

    jd_text = None
    jd_m = re.search(r"(?:目标JD|JD|岗位描述)[:：]\s*([\s\S]+)", text, re.IGNORECASE)
    if jd_m and len(jd_m.group(1).strip()) > 40:
        jd_text = jd_m.group(1).strip()

    return {"target_position": target, "jd_text": jd_text}


def _save_record(
    db: Session,
    *,
    user_id: uuid.UUID,
    conversation_id: uuid.UUID | None,
    task_type: str,
    source_text: str | None,
    result: dict,
    evaluation: dict | None,
    target_position: str | None = None,
    jd_text: str | None = None,
) -> ResumeVersion:
    record = ResumeVersion(
        user_id=user_id,
        conversation_id=conversation_id,
        task_type=task_type,
        source_text=source_text,
        target_position=target_position,
        jd_text=jd_text,
        result_json=result,
        evaluation_json=evaluation,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def _sync_parse_to_memory(db: Session, user_id: uuid.UUID, parsed: ResumeParseResult) -> None:
    """Best-effort write parsed resume facts into Career Memory (source=resume)."""
    profile = get_or_create_profile(db, user_id)
    if parsed.target_position and not profile.target_position:
        profile.target_position = parsed.target_position
    if parsed.summary and not profile.career_summary:
        profile.career_summary = parsed.summary

    for exp in parsed.experiences:
        if not (exp.company or exp.position or exp.responsibility):
            continue
        exists = (
            db.query(Experience)
            .filter(
                Experience.user_id == user_id,
                Experience.company == exp.company,
                Experience.position == exp.position,
            )
            .first()
        )
        if exists:
            continue
        db.add(
            Experience(
                user_id=user_id,
                company=exp.company,
                position=exp.position,
                duration=exp.duration,
                responsibility=exp.responsibility,
                achievement=exp.achievement,
                source="resume",
                confidence=0.8,
            )
        )

    for proj in parsed.projects:
        if not proj.project_name:
            continue
        exists = (
            db.query(Project)
            .filter(Project.user_id == user_id, Project.project_name == proj.project_name)
            .first()
        )
        if exists:
            continue
        db.add(
            Project(
                user_id=user_id,
                project_name=proj.project_name,
                background=proj.background,
                role=proj.role,
                action=proj.action,
                result=proj.result,
                skill_tags=proj.skill_tags or None,
                confidence=0.8,
            )
        )

    for sk in parsed.skills:
        if not sk.skill_name:
            continue
        exists = db.query(Skill).filter(Skill.user_id == user_id, Skill.skill_name == sk.skill_name).first()
        if exists:
            continue
        db.add(Skill(user_id=user_id, skill_name=sk.skill_name, source="resume", confidence=0.8))

    db.commit()
