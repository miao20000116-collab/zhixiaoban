"""Add resume_versions table for Phase 3 Resume Agent.

Revision ID: 004_resume_versions
Revises: 003_job_analyses
Create Date: 2026-08-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "004_resume_versions"
down_revision: Union[str, None] = "003_job_analyses"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "resume_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("task_type", sa.String(length=32), nullable=False),
        sa.Column("source_text", sa.Text(), nullable=True),
        sa.Column("target_position", sa.String(length=255), nullable=True),
        sa.Column("jd_text", sa.Text(), nullable=True),
        sa.Column("result_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("evaluation_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_resume_versions_user_id"), "resume_versions", ["user_id"], unique=False)
    op.create_index(op.f("ix_resume_versions_conversation_id"), "resume_versions", ["conversation_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_resume_versions_conversation_id"), table_name="resume_versions")
    op.drop_index(op.f("ix_resume_versions_user_id"), table_name="resume_versions")
    op.drop_table("resume_versions")
