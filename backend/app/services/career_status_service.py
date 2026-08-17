"""Career status memory + data-backed companionship / next-action suggestions."""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any, Literal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.career_status import CareerStatus
from app.models.interview_session import InterviewSession
from app.models.job_analysis import JobAnalysis
from app.models.resume_version import ResumeVersion

MoodSignal = Literal["anxious", "stressed", "rejected", "confused", "confident", "neutral"]

STAGE_LABELS = {
    "exploring": "探索方向",
    "preparing": "准备材料",
    "applying": "投递中",
    "interviewing": "面试中",
    "offer": "Offer 决策",
    "paused": "暂停求职",
}


def get_or_create_career_status(db: Session, user_id: uuid.UUID) -> CareerStatus:
    row = db.query(CareerStatus).filter(CareerStatus.user_id == user_id).first()
    if row:
        return row
    row = CareerStatus(user_id=user_id, stage="exploring")
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
        return row
    except IntegrityError:
        # Concurrent first requests can race on the unique user_id index.
        db.rollback()
        row = db.query(CareerStatus).filter(CareerStatus.user_id == user_id).first()
        if row:
            return row
        raise


def detect_mood(text: str) -> MoodSignal:
    t = text.strip()
    if any(k in t for k in ["被拒", "挂了", "没过", "淘汰", "拒绝了", "凉了"]):
        return "rejected"
    if any(k in t for k in ["焦虑", "紧张", "慌", "睡不着", "压力大", "崩溃"]):
        return "anxious" if "焦虑" in t or "紧张" in t else "stressed"
    if any(k in t for k in ["迷茫", "不知道做什么", "没方向", "不知道选"]):
        return "confused"
    if any(k in t for k in ["有信心", "状态不错", "准备好了"]):
        return "confident"
    return "neutral"


def detect_application_mention(text: str) -> bool:
    return any(k in text for k in ["投递", "投了", "已投", "申请了", "递交简历", "海投"])


def refresh_career_status_from_history(db: Session, user_id: uuid.UUID) -> CareerStatus:
    """Recompute counts from persisted interviews / analyses."""
    status = get_or_create_career_status(db, user_id)
    interviews = (
        db.query(InterviewSession)
        .filter(InterviewSession.user_id == user_id, InterviewSession.status == "completed")
        .order_by(InterviewSession.updated_at.desc())
        .all()
    )
    status.interview_count = len(interviews)

    job_count = db.query(JobAnalysis).filter(JobAnalysis.user_id == user_id).count()
    resume_count = db.query(ResumeVersion).filter(ResumeVersion.user_id == user_id).count()
    # application_count is user-reported + heuristic floor from job analyses
    status.application_count = max(status.application_count, job_count)

    strengths: list[str] = []
    weaknesses: list[str] = []
    focus: list[str] = []
    low_scores = 0
    last_score = None

    for session in interviews[:5]:
        review = session.review_json or {}
        score = review.get("overall_score")
        if isinstance(score, int):
            last_score = last_score if last_score is not None else score
            if score < 65:
                low_scores += 1
        for s in review.get("strengths") or []:
            if s not in strengths:
                strengths.append(s)
        for w in review.get("weaknesses") or []:
            if w not in weaknesses:
                weaknesses.append(w)
                focus.append(w)

    status.last_interview_score = last_score
    status.recent_failures = low_scores
    status.strength = "；".join(strengths[:3]) if strengths else status.strength
    status.weakness = "；".join(weaknesses[:3]) if weaknesses else status.weakness
    status.focus_areas = focus[:5] or status.focus_areas

    if status.interview_count >= 1:
        status.stage = "interviewing"
    elif resume_count >= 1 or job_count >= 1:
        status.stage = "preparing" if status.stage == "exploring" else status.stage

    status.next_action = suggest_next_action(status, trigger="refresh")
    status.updated_at = datetime.utcnow()
    db.add(status)
    db.commit()
    db.refresh(status)
    return status


def record_interview_completed(
    db: Session,
    user_id: uuid.UUID,
    *,
    overall_score: int | None,
    strengths: list[str] | None = None,
    weaknesses: list[str] | None = None,
) -> CareerStatus:
    status = refresh_career_status_from_history(db, user_id)
    if overall_score is not None:
        status.last_interview_score = overall_score
        if overall_score < 65:
            status.recent_failures = (status.recent_failures or 0) + 1
    if strengths:
        status.strength = "；".join(strengths[:3])
    if weaknesses:
        status.weakness = "；".join(weaknesses[:3])
        status.focus_areas = weaknesses[:5]
    status.stage = "interviewing"
    status.next_action = suggest_next_action(status, trigger="interview_done")
    status.updated_at = datetime.utcnow()
    db.add(status)
    db.commit()
    db.refresh(status)
    return status


def apply_user_signal(db: Session, user_id: uuid.UUID, text: str) -> CareerStatus:
    status = get_or_create_career_status(db, user_id)
    mood = detect_mood(text)
    moods = dict(status.mood_signals or {})
    moods["last"] = mood
    moods["updated_at"] = datetime.utcnow().isoformat()
    status.mood_signals = moods

    if detect_application_mention(text):
        # Extract "投了3家" style counts
        m = re.search(r"投(?:递)?了?\s*(\d+)\s*(?:家|次|份)?", text)
        if m:
            status.application_count = max(status.application_count, int(m.group(1)))
        else:
            status.application_count += 1
        status.stage = "applying"

    if mood == "rejected":
        status.recent_failures = (status.recent_failures or 0) + 1
        status.stage = "interviewing"

    status.next_action = suggest_next_action(status, trigger="user_signal", mood=mood)
    status.updated_at = datetime.utcnow()
    db.add(status)
    db.commit()
    db.refresh(status)
    return status


def suggest_next_action(
    status: CareerStatus,
    *,
    trigger: str = "refresh",
    mood: MoodSignal | None = None,
) -> str:
    focus = (status.focus_areas or [])
    focus_text = focus[0] if focus else (status.weakness or "技术问题")

    if mood == "rejected" or (status.recent_failures or 0) >= 3:
        return f"最近面试反馈偏弱，主要短板集中在「{focus_text}」。建议先做 1 次针对性专项训练，再继续投递。"
    if trigger == "interview_done":
        return f"本轮面试已复盘。建议立刻针对「{focus_text}」做一轮追问训练，巩固薄弱点。"
    if status.interview_count == 0 and (status.application_count or 0) == 0:
        return "建议先完成一次目标岗位 JD 分析，再优化针对该岗位的简历。"
    if status.interview_count == 0:
        return "材料已有基础。建议开始一场模拟面试，提前暴露表达与技术短板。"
    if (status.last_interview_score or 100) < 70:
        return f"最近模拟面试得分 {status.last_interview_score}，优先补强「{focus_text}」。"
    return "保持节奏：本周完成 1 次岗位定制简历 + 1 次模拟面试复盘。"


def sanitize_latest_gap_for_display(gap: dict[str, Any] | None) -> dict[str, Any] | None:
    """Hide historically dirty latest_gap rows from Profile / sidebar."""
    if not gap or not isinstance(gap, dict):
        return None
    evaluation = gap.get("evaluation") if isinstance(gap.get("evaluation"), dict) else {}
    if evaluation.get("risk_level") == "not_applicable":
        return gap
    summary = str(gap.get("summary") or "")
    if any(k in summary for k in ["解析失败", "行动计划解析失败"]):
        return None
    strengths = gap.get("strengths") or []
    gaps = gap.get("gaps") or []
    evidence = gap.get("evidence") or []
    score = int(gap.get("match_score") or 0)
    # Pre-fix empty-reuse junk: numeric score with no structured content
    if score > 0 and not strengths and not gaps and not evidence:
        return None
    return gap


def build_companionship_context(status: CareerStatus) -> str:
    """Facts for Master/Career replies — never empty pep-talk."""
    lines = [
        "## 求职状态（Career Status）",
        f"- 阶段：{STAGE_LABELS.get(status.stage, status.stage)}",
        f"- 模拟面试次数：{status.interview_count}",
        f"- 投递/申请相关次数：{status.application_count}",
        f"- 最近面试得分：{status.last_interview_score if status.last_interview_score is not None else '暂无'}",
        f"- 近期偏弱次数：{status.recent_failures}",
        f"- 优势：{status.strength or '暂无汇总'}",
        f"- 短板：{status.weakness or '暂无汇总'}",
        f"- 建议下一步：{status.next_action or '暂无'}",
    ]
    mood = (status.mood_signals or {}).get("last")
    if mood and mood != "neutral":
        lines.append(f"- 近期情绪信号：{mood}")
    lines.append(
        "\n陪伴约束：禁止空泛鼓励（如「你一定可以」）。必须引用以上数据给出可执行下一步。"
    )
    return "\n".join(lines)


def status_to_dict(status: CareerStatus) -> dict[str, Any]:
    return {
        "id": str(status.id),
        "user_id": str(status.user_id),
        "stage": status.stage,
        "stage_label": STAGE_LABELS.get(status.stage, status.stage),
        "interview_count": status.interview_count,
        "application_count": status.application_count,
        "strength": status.strength,
        "weakness": status.weakness,
        "mood_signals": status.mood_signals,
        "recent_failures": status.recent_failures,
        "last_interview_score": status.last_interview_score,
        "focus_areas": status.focus_areas,
        "next_action": status.next_action,
        "latest_gap": sanitize_latest_gap_for_display(status.latest_gap),
        "updated_at": status.updated_at.isoformat() if status.updated_at else None,
    }
