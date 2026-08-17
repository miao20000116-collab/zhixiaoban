"""Next Action Recommendation helpers after key Agent workflows."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.recommendation import Recommendation


def recommend_after_job_analysis(
    *,
    position: str | None = None,
    company: str | None = None,
    match_gaps: list[str] | None = None,
    external_sources: list[str] | None = None,
) -> dict[str, Any]:
    target = position or "该岗位"
    company_part = f"（{company}）" if company else ""
    gap = (match_gaps or [])[:2]
    why = (
        f"刚完成 {target}{company_part} 的 JD 分析"
        + (f"，当前主要差距：{'、'.join(gap)}" if gap else "，定制简历能直接对齐岗位关键词与能力要求")
        + "。"
    )
    sources: list[dict[str, str]] = [
        {"type": "workflow", "label": "本次 JD 分析结果"},
    ]
    if company:
        sources.append({"type": "external", "label": f"公司/行业检索：{company}"})
    for s in (external_sources or [])[:3]:
        sources.append({"type": "external", "label": str(s)})
    return {
        "trigger": "job_analysis_done",
        "title": "优化针对该岗位的简历",
        "message": f"已完成 {target}{company_part} 的 JD 分析。是否优化一份针对该岗位的简历？",
        "why": why,
        "sources": sources,
        "actions": [
            {"id": "optimize_resume", "label": "我想按这份 JD 优化简历", "intent": "resume"},
            {"id": "start_interview", "label": "我想开始该岗位模拟面试", "intent": "interview"},
            {"id": "gap_analysis", "label": "我想做能力差距分析", "intent": "career_consult"},
            {"id": "star_rewrite", "label": "我想做 STAR 经历改写", "intent": "resume"},
        ],
    }


def recommend_after_resume_optimize(*, target_position: str | None = None) -> dict[str, Any]:
    pos = target_position or "目标岗位"
    return {
        "trigger": "resume_optimize_done",
        "title": "用新简历做模拟面试",
        "message": f"简历已按「{pos}」定制。是否立刻开始一场模拟面试，检验表达与匹配度？",
        "why": f"简历已按「{pos}」完成定制，模拟面试能最快验证表达是否撑得住岗位要求。",
        "sources": [
            {"type": "workflow", "label": "本次简历优化结果"},
            {"type": "memory", "label": "职业档案中的目标岗位与经历"},
        ],
        "actions": [
            {"id": "start_interview", "label": "我想开始模拟面试练表达", "intent": "interview"},
            {"id": "voice_interview", "label": "我想做语音模拟面试", "intent": "interview"},
            {"id": "star_rewrite", "label": "我想继续做 STAR 改写", "intent": "resume"},
            {"id": "check_jd", "label": "我想对照 JD 再检查简历", "intent": "job_analysis"},
        ],
    }


def recommend_after_interview(
    *,
    weaknesses: list[str] | None = None,
    overall_score: int | None = None,
    interview_count: int | None = None,
) -> dict[str, Any]:
    focus = (weaknesses or ["技术问题"])[0]
    score_hint = f"本轮综合分 {overall_score}。" if overall_score is not None else ""
    count_hint = f"累计已完成 {interview_count} 场模拟。" if interview_count else ""
    why = f"{score_hint}{count_hint}复盘显示主要短板是「{focus}」，专项训练比继续海投更高效。"
    return {
        "trigger": "interview_done",
        "title": "训练刚才暴露的问题",
        "message": f"{score_hint}主要短板：{focus}。是否针对该短板做一轮专项训练？",
        "why": why,
        "sources": [
            {"type": "workflow", "label": "本轮面试复盘"},
            {"type": "memory", "label": "最近面试得分与短板汇总"},
        ],
        "actions": [
            {
                "id": "technical_drill",
                "label": "我想针对短板做专项训练",
                "intent": "interview",
                "payload": {"mode": "technical_interview"},
            },
            {"id": "voice_interview", "label": "我想做语音表达训练", "intent": "interview"},
            {"id": "optimize_resume", "label": "我想按短板回改简历", "intent": "resume"},
            {"id": "another_round", "label": "我想再来一轮模拟面试", "intent": "interview"},
        ],
    }


def recommend_from_career_status(
    *,
    next_action: str,
    stage_label: str | None = None,
    last_interview_score: int | None = None,
    weakness: str | None = None,
) -> dict[str, Any]:
    why_parts = []
    if stage_label:
        why_parts.append(f"当前求职阶段为「{stage_label}」")
    if last_interview_score is not None:
        why_parts.append(f"最近模拟面试得分 {last_interview_score}")
    if weakness:
        why_parts.append(f"短板集中在「{weakness.split('；')[0]}」")
    why = "；".join(why_parts) + "。" if why_parts else "基于你的 Career Status 与历史表现给出下一步。"
    return {
        "trigger": "career_status",
        "title": "建议下一步",
        "message": next_action,
        "why": why,
        "sources": [
            {"type": "memory", "label": "Career Status（阶段/面试次数/短板）"},
            {"type": "memory", "label": "职业档案与近期对话记忆"},
        ],
        "actions": [
            {"id": "follow_suggestion", "label": "我想按建议继续推进", "intent": "general_chat"},
            {"id": "optimize_resume", "label": "我想优化我的简历", "intent": "resume"},
            {"id": "start_interview", "label": "我想开始模拟面试", "intent": "interview"},
            {"id": "gap_analysis", "label": "我想做能力差距分析", "intent": "career_consult"},
        ],
    }


def format_recommendation_markdown(rec: dict[str, Any]) -> str:
    lines = ["", "---", "", f"**下一步建议：** {rec.get('message', '')}", ""]
    if rec.get("why"):
        lines.append(f"**为什么：** {rec['why']}")
        lines.append("")
    sources = rec.get("sources") or []
    if sources:
        lines.append("**依据来源：**")
        for s in sources:
            label = s.get("label") if isinstance(s, dict) else str(s)
            lines.append(f"- {label}")
        lines.append("")
    for action in rec.get("actions") or []:
        lines.append(f"- {action.get('label')}")
    return "\n".join(lines)


def persist_next_action(
    db: Session,
    user_id: uuid.UUID,
    next_action: dict[str, Any] | None,
    *,
    conversation_id: uuid.UUID | None = None,
) -> Recommendation | None:
    """Persist a UI next_action so recommendation history is not just ephemeral SSE."""
    if not next_action:
        return None
    action = str(next_action.get("message") or next_action.get("title") or "").strip()
    if not action:
        return None
    row = Recommendation(
        user_id=user_id,
        conversation_id=conversation_id,
        action=action,
        why=next_action.get("why"),
        sources=next_action.get("sources") or [],
        priority=str(next_action.get("priority") or "medium"),
        status="pending",
        trigger=next_action.get("trigger"),
        plan=next_action.get("plan"),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
