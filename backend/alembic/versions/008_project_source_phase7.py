"""Add projects.source for Phase 7 attribution.

Revision ID: 008_project_source_phase7
Revises: 007_voice_career_status
Create Date: 2026-08-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008_project_source_phase7"
down_revision: Union[str, None] = "007_voice_career_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("source", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "source")
