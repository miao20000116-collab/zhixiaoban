"""Add interview_audios and career_statuses for Phase 6.

Revision ID: 007_voice_career_status
Revises: 006_evaluation_qc
Create Date: 2026-08-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "007_voice_career_status"
down_revision: Union[str, None] = "006_evaluation_qc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "interview_audios",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("audio_url", sa.String(length=512), nullable=False),
        sa.Column("transcript", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("question_text", sa.Text(), nullable=True),
        sa.Column("analysis", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("answer_score", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["interview_sessions.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_interview_audios_session_id"), "interview_audios", ["session_id"], unique=False)

    op.create_table(
        "career_statuses",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("stage", sa.String(length=50), nullable=False),
        sa.Column("interview_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("application_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("strength", sa.Text(), nullable=True),
        sa.Column("weakness", sa.Text(), nullable=True),
        sa.Column("mood_signals", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("recent_failures", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_interview_score", sa.Integer(), nullable=True),
        sa.Column("focus_areas", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("next_action", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_career_statuses_user_id"), "career_statuses", ["user_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_career_statuses_user_id"), table_name="career_statuses")
    op.drop_table("career_statuses")
    op.drop_index(op.f("ix_interview_audios_session_id"), table_name="interview_audios")
    op.drop_table("interview_audios")
