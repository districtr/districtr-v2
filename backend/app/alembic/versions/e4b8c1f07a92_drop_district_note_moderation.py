"""drop district note moderation columns

Moderation now applies to portal submissions only; district notes are the
author's own annotations and are served verbatim. Downgrade restores the
columns empty (every note clean), since the verdicts are not recoverable.

Revision ID: e4b8c1f07a92
Revises: a7c2e9d4b150
Create Date: 2026-09-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e4b8c1f07a92"
down_revision: Union[str, None] = "a7c2e9d4b150"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("district_notes", "moderation_score", schema="comments")
    op.drop_column("district_notes", "nsfw", schema="comments")


def downgrade() -> None:
    op.add_column(
        "district_notes",
        sa.Column("nsfw", sa.Boolean(), server_default="false", nullable=False),
        schema="comments",
    )
    op.add_column(
        "district_notes",
        sa.Column("moderation_score", sa.Float(), nullable=True),
        schema="comments",
    )
