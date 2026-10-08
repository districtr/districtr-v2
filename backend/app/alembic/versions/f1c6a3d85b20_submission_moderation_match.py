"""submissions: moderation_match replaces moderation_score

The word-list check has no score, only a verdict and the phrase that caused
it. Storing the phrase lets portal admins see why an entry was blurred and
trace a false positive to its blocklist entry. Legacy OpenAI-era scores are
dropped; `nsfw` still carries every existing verdict. Downgrade restores the
score as 1.0 for matched rows, NULL otherwise.

Revision ID: f1c6a3d85b20
Revises: e4b8c1f07a92
Create Date: 2026-09-30
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1c6a3d85b20"
down_revision: Union[str, None] = "e4b8c1f07a92"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "submissions",
        sa.Column("moderation_match", sa.String(255), nullable=True),
        schema="comments",
    )
    op.drop_column("submissions", "moderation_score", schema="comments")


def downgrade() -> None:
    op.add_column(
        "submissions",
        sa.Column("moderation_score", sa.Float(), nullable=True),
        schema="comments",
    )
    op.execute(
        "UPDATE comments.submissions SET moderation_score = 1.0 "
        "WHERE moderation_match IS NOT NULL"
    )
    op.drop_column("submissions", "moderation_match", schema="comments")
