"""Add interview_sessions table for Phase 4 Interview Agent.

Revision ID: 005_interview_sessions
Revises: 004_resume_versions
Create Date: 2026-08-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "005_interview_sessions"
down_revision: Union[str, None] = "004_resume_versions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "interview_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("mode", sa.String(length=32), nullable=False),
        sa.Column("stage", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("position", sa.String(length=255), nullable=True),
        sa.Column("jd_text", sa.Text(), nullable=True),
        sa.Column("resume_text", sa.Text(), nullable=True),
        sa.Column("question_bank_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("turns_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("turns_in_stage", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("review_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("evaluation_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_interview_sessions_user_id"), "interview_sessions", ["user_id"], unique=False)
    op.create_index(
        op.f("ix_interview_sessions_conversation_id"), "interview_sessions", ["conversation_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_interview_sessions_conversation_id"), table_name="interview_sessions")
    op.drop_index(op.f("ix_interview_sessions_user_id"), table_name="interview_sessions")
    op.drop_table("interview_sessions")
