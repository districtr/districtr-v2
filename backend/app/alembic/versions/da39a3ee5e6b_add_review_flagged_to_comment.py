"""District comment migration

Add review_flagged column to comment table.
Add comment_length_limit column to districtrmap table
Add comment_count_limit column to districtrmap table

Revision ID: da39a3ee5e6b
Revises: 111fa461521c
Create Date: 2025-02-17

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "da39a3ee5e6b"
down_revision: Union[str, None] = "111fa461521c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add review_flagged to comments.comment
    op.add_column(
        "comment",
        sa.Column(
            "review_flagged", sa.Boolean(), nullable=False, server_default="false"
        ),
        schema="comments",
    )
    # Add comment_length_limit to public.districtrmap
    op.add_column(
        "districtrmap",
        sa.Column("comment_length_limit", sa.Integer(), nullable=True),
        schema="public",
    )
    # Add comment_count_limit to public.districtrmap
    op.add_column(
        "districtrmap",
        sa.Column("comment_count_limit", sa.Integer(), nullable=True),
        schema="public",
    )


def downgrade() -> None:
    # Drop review_flagged from comments.comment
    op.drop_column("comment", "review_flagged", schema="comments")
    # Drop comment_length_limit from public.districtrmap
    op.drop_column("districtrmap", "comment_length_limit", schema="public")
    # Drop comment_count_limit from public.districtrmap
    op.drop_column("districtrmap", "comment_count_limit", schema="public")
