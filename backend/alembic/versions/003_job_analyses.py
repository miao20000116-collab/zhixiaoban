"""Add job_analyses table for Phase 2 Job Intelligence.

Revision ID: 003_job_analyses
Revises: 002_skills
Create Date: 2026-08-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "003_job_analyses"
down_revision: Union[str, None] = "002_skills"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "job_analyses",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("input_type", sa.String(length=32), nullable=False),
        sa.Column("input_text", sa.Text(), nullable=True),
        sa.Column("position", sa.String(length=255), nullable=True),
        sa.Column("company", sa.String(length=255), nullable=True),
        sa.Column("result_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("evaluation_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_job_analyses_user_id"), "job_analyses", ["user_id"], unique=False)
    op.create_index(op.f("ix_job_analyses_conversation_id"), "job_analyses", ["conversation_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_job_analyses_conversation_id"), table_name="job_analyses")
    op.drop_index(op.f("ix_job_analyses_user_id"), table_name="job_analyses")
    op.drop_table("job_analyses")
