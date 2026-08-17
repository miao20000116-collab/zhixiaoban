"""Career status memory — job-search stage and progress signals."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class CareerStatus(Base):
    """Tracks the user's job-search stage for companionship and recommendations."""

    __tablename__ = "career_statuses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True, index=True
    )
    stage: Mapped[str] = mapped_column(String(50), default="exploring", nullable=False)
    # exploring | preparing | applying | interviewing | offer | paused
    interview_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    application_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    strength: Mapped[str | None] = mapped_column(Text, nullable=True)
    weakness: Mapped[str | None] = mapped_column(Text, nullable=True)
    mood_signals: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    recent_failures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_interview_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    focus_areas: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    next_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    latest_gap: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
