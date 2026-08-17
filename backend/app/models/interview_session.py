"""Interview session persistence for Phase 4 mock interviews."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id"), nullable=True, index=True
    )
    mode: Mapped[str] = mapped_column(String(32), nullable=False, default="full")  # full | technical_interview
    stage: Mapped[str] = mapped_column(String(32), nullable=False, default="START")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")  # active | completed
    position: Mapped[str | None] = mapped_column(String(255), nullable=True)
    jd_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    resume_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    question_bank_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    turns_json: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    turns_in_stage: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    review_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    evaluation_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
