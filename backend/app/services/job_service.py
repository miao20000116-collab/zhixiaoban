"""Job Intelligence orchestration service."""

from __future__ import annotations

import asyncio
import uuid
from typing import Literal

from sqlalchemy.orm import Session

from app.agents.career_gap.schema import CareerGapResult
from app.agents.evaluation.agent import EvaluationAgent
from app.agents.job.agent import JobAgent
from app.agents.job.schema import JobAnalysisResult
from app.config import settings
from app.evaluation import finish_run, new_trace, save_evaluation_record, traced_run
from app.memory.service import build_memory_context
from app.models.job_analysis import JobAnalysis
from app.services.career_intelligence_service import format_gap_markdown, run_gap_analysis
from app.services.recommendation import format_recommendation_markdown, recommend_after_job_analysis
from app.services.tools.search import format_search_context, search_company_and_industry


InputType = Literal["jd_text", "jd_file", "position_company"]


async def run_job_analysis(
    db: Session,
    *,
    user_id: uuid.UUID,
    jd_text: str | None = None,
    position: str | None = None,
    company: str | None = None,
    input_type: InputType = "jd_text",
    conversation_id: uuid.UUID | None = None,
    with_career_gap: bool = True,
) -> tuple[JobAnalysisResult, JobAnalysis, CareerGapResult | None]:
    """Run Job Agent + Evaluation (+ Career Gap), persist, return (analysis, record, gap)."""
    memory_context = build_memory_context(db, user_id)
    ctx = new_trace(user_id=user_id, conversation_id=conversation_id)

    async with traced_run(
        db,
        ctx,
        agent_name="job",
        task_type="analyze",
        input_data={"jd_text": jd_text, "position": position, "company": company},
    ) as job_run:
        job_agent = JobAgent()
        analysis = await asyncio.wait_for(
            job_agent.analyze(
                jd_text=jd_text,
                position=position,
                company=company,
                memory_context=memory_context,
            ),
            timeout=settings.agent_task_timeout_seconds,
        )
        finish_run(db, job_run, analysis.model_dump())

    # Rebuild search context for evaluation (best-effort)
    overview = analysis.position_overview
    search_data = await search_company_and_industry(
        company or overview.company,
        position or overview.position,
        overview.industry,
    )
    search_context = format_search_context(search_data)

    async with traced_run(
        db,
        ctx,
        agent_name="evaluation",
        task_type="job_analysis",
        input_data={"agent": "job"},
    ) as eval_run:
        evaluation = await asyncio.wait_for(
            EvaluationAgent().evaluate_job_analysis(
                analysis,
                jd_text=jd_text,
                search_context=search_context,
            ),
            timeout=settings.agent_task_timeout_seconds,
        )
        finish_run(db, eval_run, evaluation.model_dump())

    analysis.evaluation = evaluation.model_dump()
    save_evaluation_record(
        db,
        agent_name="job",
        task_type="analyze",
        evaluation=evaluation,
        input_data={"jd_text": (jd_text or "")[:2000], "position": position, "company": company},
        output_data=analysis.model_dump(exclude={"evaluation"}),
        user_id=user_id,
        conversation_id=conversation_id,
        trace_id=ctx.trace_id,
    )

    record = JobAnalysis(
        user_id=user_id,
        conversation_id=conversation_id,
        input_type=input_type,
        input_text=jd_text,
        position=position or overview.position,
        company=company or overview.company,
        result_json=analysis.model_dump(exclude={"evaluation"}),
        evaluation_json=evaluation.model_dump(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    gap: CareerGapResult | None = None
    if with_career_gap:
        try:
            gap = await run_gap_analysis(
                db,
                user_id,
                target_position=overview.position or position,
                company=overview.company or company,
                target_jd=jd_text,
                industry_context=(analysis.industry_trends.summary or "") if analysis.industry_trends else "",
                jd_id=record.id,
                job_analysis=analysis.model_dump(exclude={"evaluation", "user_match"}),
            )
        except Exception:  # noqa: BLE001 — gap is additive; JD result still valid
            gap = None

    return analysis, record, gap


def format_analysis_markdown(
    analysis: JobAnalysisResult,
    *,
    career_gap: CareerGapResult | None = None,
) -> str:
    """Convert structured analysis to Markdown for chat display."""
    ov = analysis.position_overview
    match = analysis.user_match
    company = analysis.company_analysis
    industry = analysis.industry_trends
    evaluation = analysis.evaluation or {}

    lines = [
        "# 岗位分析报告",
        "",
        "## 岗位概览",
        f"- **岗位**：{ov.position or '未知'}",
        f"- **公司**：{ov.company or '未知'}",
        f"- **行业**：{ov.industry or '未知'}",
        f"- **级别**：{ov.level or '未知'}",
        f"- **摘要**：{ov.summary or '—'}",
        "",
        "## 核心职责",
    ]
    lines.extend([f"- {item}" for item in analysis.core_responsibilities] or ["- （暂无）"])

    lines.extend(["", "## 技能要求", "### 必备"])
    lines.extend([f"- {item}" for item in analysis.required_skills] or ["- （暂无）"])
    lines.extend(["", "### 加分"])
    lines.extend([f"- {item}" for item in analysis.nice_to_have_skills] or ["- （暂无）"])

    lines.extend(["", "## 隐藏要求"])
    lines.extend([f"- {item}" for item in analysis.hidden_requirements] or ["- （暂无）"])

    lines.extend(["", "## 面试重点"])
    lines.extend([f"- {item}" for item in analysis.interview_focus] or ["- （暂无）"])

    inferred = "（含推测）" if company.is_inferred else ""
    lines.extend(
        [
            "",
            f"## 公司分析 {inferred}",
            f"- **概述**：{company.overview or '—'}",
            f"- **业务**：{company.business or '—'}",
            f"- **截至**：{company.as_of or '—'}",
        ]
    )
    if company.recent_updates:
        lines.append("- **近期动态**：")
        lines.extend([f"  - {u}" for u in company.recent_updates])
    if company.sources:
        lines.append("- **来源**：")
        lines.extend([f"  - {s}" for s in company.sources])

    industry_tag = "（含推测）" if industry.is_inferred else ""
    lines.extend(["", f"## 行业趋势 {industry_tag}", f"{industry.summary or '—'}"])
    lines.extend([f"- {t}" for t in industry.trends])

    # Prefer dedicated Career Gap Analysis when available
    if career_gap is not None:
        lines.extend(["", "---", "", "## 与你的匹配分析", ""])
        gap_md = format_gap_markdown(career_gap)
        gap_body = "\n".join(
            line for line in gap_md.splitlines() if not line.startswith("# 职业差距分析")
        ).strip()
        lines.append(gap_body)
    else:
        clue_only = "推测" in (ov.summary or "")
        score_line = (
            "**匹配分：暂不评分（无完整 JD，当前为启发式占位）**"
            if clue_only
            else f"**匹配分：{match.score}/100**"
        )
        lines.extend(
            [
                "",
                "## 与你的匹配分析",
                score_line,
                "",
                "### 优势",
            ]
        )
        lines.extend([f"- {s}" for s in match.strengths] or ["- （暂无）"])
        lines.extend(["", "### 不足"])
        lines.extend([f"- {g}" for g in match.gaps] or ["- （暂无）"])
        lines.extend(["", "### 建议"])
        lines.extend([f"- {s}" for s in match.suggestions] or ["- （暂无）"])

    if evaluation:
        lines.extend(
            [
                "",
                "## 真实性检查",
                f"- **风险等级**：{evaluation.get('risk_level', 'unknown')}",
                f"- **质量分**：{evaluation.get('score', '—')}",
            ]
        )
        problems = evaluation.get("problems") or []
        fabricated = evaluation.get("fabricated_claims") or []
        suggestions = evaluation.get("suggestions") or []
        if problems:
            lines.append("- **问题**：")
            lines.extend([f"  - {p}" for p in problems])
        if fabricated:
            lines.append("- **疑似虚构**：")
            lines.extend([f"  - {p}" for p in fabricated])
        if suggestions:
            lines.append("- **建议**：")
            lines.extend([f"  - {s}" for s in suggestions])

    gap_titles = (
        [g.title for g in career_gap.gaps]
        if career_gap and career_gap.gaps
        else list(match.gaps or [])
    )
    lines.append(
        format_recommendation_markdown(
            recommend_after_job_analysis(
                position=ov.position,
                company=ov.company,
                match_gaps=gap_titles,
                external_sources=list(company.sources or []),
            )
        )
    )

    return "\n".join(lines)


def looks_like_jd(text: str) -> bool:
    """Heuristic for JD paste. Never use length alone (avoids hijacking interview answers)."""
    stripped = (text or "").strip()
    if len(stripped) < 40:
        return False
    lowered = stripped.lower()

    strong = [
        "任职要求",
        "岗位职责",
        "职位描述",
        "job description",
        "responsibilities",
        "requirements",
    ]
    if any(k in lowered for k in strong):
        return True

    keywords = ["职责", "要求", "岗位", "任职", "招聘", "jd"]
    hits = sum(1 for k in keywords if k in lowered)
    if hits >= 2 and len(stripped) >= 80:
        return True
    # Single keyword only when accompanying hiring-context signals
    if hits >= 1 and len(stripped) >= 150 and any(
        k in stripped for k in ["公司", "经验", "学历", "薪资", "年薪", "本科", "硕士"]
    ):
        return True
    return False
