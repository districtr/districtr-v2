"""add review_flagged to comment

Revision ID: a1b2c3d4e5f7
Revises: 111fa461521c
Create Date: 2025-02-17

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f7"
down_revision: Union[str, None] = "111fa461521c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "comment",
        sa.Column("review_flagged", sa.Boolean(), nullable=False, server_default="false"),
        schema="comments",
    )


def downgrade() -> None:
    op.drop_column("comment", "review_flagged", schema="comments")
