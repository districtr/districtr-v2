"""add community mode tables

Revision ID: 112a59ed50a2
Revises: da39a3ee5e6b
Create Date: 2026-03-17 07:56:56.013703

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "112a59ed50a2"
down_revision: Union[str, None] = "da39a3ee5e6b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "document",
        sa.Column("num_communities", sa.Integer(), nullable=True),
        schema="document",
    )
    op.add_column(
        "document",
        sa.Column(
            "community_metadata_list",
            postgresql.JSON(astext_type=sa.Text()),
            nullable=True,
        ),
        schema="document",
    )


def downgrade() -> None:
    op.drop_column("document", "community_metadata_list", schema="document")
    op.drop_column("document", "num_communities", schema="document")
