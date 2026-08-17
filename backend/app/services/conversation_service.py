"""Conversation business logic."""

from __future__ import annotations

import re
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.conversation import Conversation
from app.models.message import Message
from app.services.dev_user import get_or_create_dev_user


class ConversationNotFoundError(Exception):
    pass


def list_conversations(db: Session) -> list[Conversation]:
    user = get_or_create_dev_user(db)
    return (
        db.query(Conversation)
        .filter(Conversation.user_id == user.id, Conversation.status == "active")
        .order_by(Conversation.updated_at.desc())
        .all()
    )


def create_conversation(db: Session, title: str = "新对话") -> Conversation:
    user = get_or_create_dev_user(db)
    conversation = Conversation(user_id=user.id, title=title)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def get_conversation(db: Session, conversation_id: uuid.UUID) -> Conversation:
    user = get_or_create_dev_user(db)
    conversation = (
        db.query(Conversation)
        .filter(Conversation.id == conversation_id, Conversation.user_id == user.id)
        .first()
    )
    if conversation is None:
        raise ConversationNotFoundError(f"Conversation {conversation_id} not found")
    return conversation


def update_conversation_title(db: Session, conversation_id: uuid.UUID, title: str) -> Conversation:
    conversation = get_conversation(db, conversation_id)
    conversation.title = title
    conversation.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(conversation)
    return conversation


def delete_conversation(db: Session, conversation_id: uuid.UUID) -> None:
    """Delete a conversation and detach/clear dependent rows that block FK deletes."""
    from app.models.agent_run import AgentRun
    from app.models.career_task import CareerTask
    from app.models.evaluation_record import EvaluationRecord
    from app.models.interview_audio import InterviewAudio
    from app.models.interview_session import InterviewSession
    from app.models.job_analysis import JobAnalysis
    from app.models.recommendation import Recommendation
    from app.models.resume_version import ResumeVersion

    conversation = get_conversation(db, conversation_id)

    session_ids = [
        row.id
        for row in db.query(InterviewSession.id)
        .filter(InterviewSession.conversation_id == conversation_id)
        .all()
    ]
    if session_ids:
        db.query(InterviewAudio).filter(InterviewAudio.session_id.in_(session_ids)).delete(
            synchronize_session=False
        )
        db.query(InterviewSession).filter(InterviewSession.id.in_(session_ids)).delete(
            synchronize_session=False
        )

    db.query(Message).filter(Message.conversation_id == conversation_id).delete(
        synchronize_session=False
    )
    for model in (
        CareerTask,
        JobAnalysis,
        ResumeVersion,
        Recommendation,
        EvaluationRecord,
        AgentRun,
    ):
        db.query(model).filter(model.conversation_id == conversation_id).update(
            {model.conversation_id: None},
            synchronize_session=False,
        )

    db.delete(conversation)
    db.commit()


def list_messages(db: Session, conversation_id: uuid.UUID) -> list[Message]:
    get_conversation(db, conversation_id)
    return (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
        .all()
    )


_COMPANY_PATTERNS = [
    r"(字节|字节跳动|ByteDance)",
    r"(阿里|阿里巴巴|Alibaba)",
    r"(腾讯|Tencent)",
    r"(美团)",
    r"(京东)",
    r"(华为)",
    r"(百度)",
    r"(拼多多|PDD)",
    r"(小红书)",
    r"(网易)",
    r"(微软|Microsoft)",
    r"(谷歌|Google)",
]


def _extract_company(text: str) -> str | None:
    for pattern in _COMPANY_PATTERNS:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            return m.group(1)
    m = re.search(r"([\u4e00-\u9fa5A-Za-z0-9]{2,12})\s*(?:面试|一面|二面|终面)", text)
    if m:
        return m.group(1)
    return None


def generate_conversation_title(
    user_message: str,
    *,
    intent: str | None = None,
) -> str:
    """Rule-based smart title — e.g. 「字节 AI 产品经理面试准备」."""
    text = user_message.strip().replace("\n", " ")
    company = _extract_company(text)

    if intent == "interview" or any(
        k in text for k in ["模拟面试", "开始面试", "面试准备", "语音模拟面试", "问我一些技术"]
    ):
        if "技术" in text:
            base = f"{company}技术面试训练" if company else "技术专项面试训练"
        else:
            base = f"{company}面试准备" if company else "模拟面试准备"
        return base[:40]

    if intent == "jd_analysis" or any(k in text for k in ["分析JD", "分析 jd", "岗位分析", "帮我看看"]):
        pos_m = re.search(r"(?:岗位|职位)[:：]?\s*([^\n,，。]{2,20})", text)
        position = pos_m.group(1).strip() if pos_m else None
        if company and position:
            return f"{company}·{position}岗位分析"[:40]
        if company:
            return f"{company}岗位分析"[:40]
        if position:
            return f"{position}岗位分析"[:40]
        return "岗位 JD 分析"

    if intent == "resume" or any(k in text for k in ["简历", "STAR", "自我介绍"]):
        if "优化" in text or "改" in text:
            return "简历优化" if not company else f"{company}定向简历优化"[:40]
        return "简历诊断与改写"

    if intent == "career_consult" or any(k in text for k in ["焦虑", "被拒", "迷茫", "压力", "Offer", "offer"]):
        if "offer" in text.lower():
            return "Offer 决策咨询"
        if any(k in text for k in ["焦虑", "压力", "被拒"]):
            return "求职状态陪伴"
        return "职业方向咨询"

    if any(k in text for k in ["投递", "海投", "申请"]):
        return "投递策略讨论"

    # Fallback: compact meaningful phrase (not raw dump)
    cleaned = re.sub(r"\s+", " ", text)
    if len(cleaned) <= 18:
        return cleaned or "新对话"
    return cleaned[:18] + "…"


def maybe_update_title_from_first_message(
    db: Session,
    conversation: Conversation,
    message: str,
    *,
    intent: str | None = None,
) -> bool:
    """Update title when still default. Returns True if changed."""
    if conversation.title not in ("新对话", "", None):
        # Allow upgrade from truncated raw title if still looks like raw paste (>20 chars dump)
        if not intent and len(conversation.title) >= 20 and conversation.title.endswith("..."):
            pass
        elif conversation.title != "新对话":
            return False

    title = generate_conversation_title(message, intent=intent)
    if title == conversation.title:
        return False
    conversation.title = title
    conversation.updated_at = datetime.utcnow()
    db.commit()
    return True


def refresh_conversation_title_with_intent(
    db: Session,
    conversation: Conversation,
    message: str,
    intent: str | None,
) -> bool:
    """Upgrade title after Master classifies intent (first turns only)."""
    msg_count = (
        db.query(Message)
        .filter(Message.conversation_id == conversation.id, Message.role == "user")
        .count()
    )
    if msg_count > 2 and conversation.title != "新对话":
        return False
    if conversation.title != "新对话" and msg_count > 1:
        # Still allow one upgrade when title was naive truncate
        if not conversation.title.endswith("...") and "准备" in conversation.title:
            return False
    title = generate_conversation_title(message, intent=intent)
    if title == conversation.title:
        return False
    conversation.title = title
    conversation.updated_at = datetime.utcnow()
    db.commit()
    return True


def update_conversation_summary(
    db: Session,
    conversation: Conversation,
    *,
    user_message: str,
    assistant_content: str,
    intent: str | None = None,
) -> str:
    """Rolling conversation summary for sidebar + long-context hints."""
    intent_label = {
        "resume": "简历",
        "jd_analysis": "岗位分析",
        "interview": "面试",
        "career_consult": "职业咨询",
        "general_chat": "闲聊",
    }.get(intent or "", "对话")

    user_snip = re.sub(r"\s+", " ", user_message.strip())[:60]
    asst_snip = re.sub(r"\s+", " ", assistant_content.strip())[:80]
    turn = f"[{intent_label}] 用户：{user_snip} → AI：{asst_snip}"

    previous = (conversation.summary or "").strip()
    if previous:
        # Keep last ~2 turns worth
        parts = [p.strip() for p in previous.split("\n") if p.strip()]
        parts.append(turn)
        summary = "\n".join(parts[-3:])
    else:
        summary = turn

    if len(summary) > 500:
        summary = summary[-500:]

    conversation.summary = summary
    conversation.updated_at = datetime.utcnow()
    db.commit()
    return summary


def conversation_meta_payload(conversation: Conversation) -> dict:
    return {
        "id": str(conversation.id),
        "title": conversation.title,
        "summary": conversation.summary,
        "updated_at": conversation.updated_at.isoformat() if conversation.updated_at else None,
    }
