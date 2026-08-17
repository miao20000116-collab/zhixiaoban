"""Add Evaluation QC tables and AgentRun trace fields.

Revision ID: 006_evaluation_qc
Revises: 005_interview_sessions
Create Date: 2026-08-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "006_evaluation_qc"
down_revision: Union[str, None] = "005_interview_sessions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("agent_runs", sa.Column("trace_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("agent_runs", sa.Column("parent_run_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("agent_runs", sa.Column("task_type", sa.String(length=50), nullable=True))
    op.add_column("agent_runs", sa.Column("error_message", sa.Text(), nullable=True))
    op.create_index(op.f("ix_agent_runs_trace_id"), "agent_runs", ["trace_id"], unique=False)

    op.create_table(
        "evaluation_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("agent_name", sa.String(length=100), nullable=False),
        sa.Column("task_type", sa.String(length=50), nullable=False),
        sa.Column("input_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("output_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("risk_level", sa.String(length=20), nullable=False),
        sa.Column("feedback", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("trace_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_evaluation_records_agent_name"), "evaluation_records", ["agent_name"], unique=False)
    op.create_index(op.f("ix_evaluation_records_task_type"), "evaluation_records", ["task_type"], unique=False)
    op.create_index(op.f("ix_evaluation_records_risk_level"), "evaluation_records", ["risk_level"], unique=False)
    op.create_index(op.f("ix_evaluation_records_trace_id"), "evaluation_records", ["trace_id"], unique=False)

    op.create_table(
        "bad_cases",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("agent_name", sa.String(length=100), nullable=False),
        sa.Column("problem_type", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("solution", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("evaluation_record_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("context_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["evaluation_record_id"], ["evaluation_records.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_bad_cases_agent_name"), "bad_cases", ["agent_name"], unique=False)
    op.create_index(op.f("ix_bad_cases_problem_type"), "bad_cases", ["problem_type"], unique=False)
    op.create_index(op.f("ix_bad_cases_status"), "bad_cases", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_bad_cases_status"), table_name="bad_cases")
    op.drop_index(op.f("ix_bad_cases_problem_type"), table_name="bad_cases")
    op.drop_index(op.f("ix_bad_cases_agent_name"), table_name="bad_cases")
    op.drop_table("bad_cases")

    op.drop_index(op.f("ix_evaluation_records_trace_id"), table_name="evaluation_records")
    op.drop_index(op.f("ix_evaluation_records_risk_level"), table_name="evaluation_records")
    op.drop_index(op.f("ix_evaluation_records_task_type"), table_name="evaluation_records")
    op.drop_index(op.f("ix_evaluation_records_agent_name"), table_name="evaluation_records")
    op.drop_table("evaluation_records")

    op.drop_index(op.f("ix_agent_runs_trace_id"), table_name="agent_runs")
    op.drop_column("agent_runs", "error_message")
    op.drop_column("agent_runs", "task_type")
    op.drop_column("agent_runs", "parent_run_id")
    op.drop_column("agent_runs", "trace_id")
