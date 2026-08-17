"""Add career_tasks, recommendations, and latest_gap on career_statuses (Phase 8).

Revision ID: 009_career_intelligence
Revises: 008_project_source_phase7
Create Date: 2026-08-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "009_career_intelligence"
down_revision: Union[str, None] = "008_project_source_phase7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "career_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("task_type", sa.String(length=50), nullable=False),
        sa.Column("goal", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("progress", sa.Float(), nullable=False),
        sa.Column("completed_steps", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("pending_steps", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("next_action", sa.Text(), nullable=True),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_career_tasks_user_id"), "career_tasks", ["user_id"], unique=False)
    op.create_index(
        op.f("ix_career_tasks_conversation_id"), "career_tasks", ["conversation_id"], unique=False
    )

    op.create_table(
        "recommendations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("why", sa.Text(), nullable=True),
        sa.Column("sources", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("priority", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("trigger", sa.String(length=50), nullable=True),
        sa.Column("plan", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_recommendations_user_id"), "recommendations", ["user_id"], unique=False)
    op.create_index(
        op.f("ix_recommendations_conversation_id"),
        "recommendations",
        ["conversation_id"],
        unique=False,
    )

    op.add_column(
        "career_statuses",
        sa.Column("latest_gap", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("career_statuses", "latest_gap")
    op.drop_index(op.f("ix_recommendations_conversation_id"), table_name="recommendations")
    op.drop_index(op.f("ix_recommendations_user_id"), table_name="recommendations")
    op.drop_table("recommendations")
    op.drop_index(op.f("ix_career_tasks_conversation_id"), table_name="career_tasks")
    op.drop_index(op.f("ix_career_tasks_user_id"), table_name="career_tasks")
    op.drop_table("career_tasks")
