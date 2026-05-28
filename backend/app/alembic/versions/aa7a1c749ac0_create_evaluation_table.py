"""create_evaluation_table

Revision ID: aa7a1c749ac0
Revises: ce3d5aa149a5
Create Date: 2026-04-25 02:02:43.064935

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision: str = "aa7a1c749ac0"
down_revision: Union[str, None] = "ce3d5aa149a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "evaluation",
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("document_id", UUID(), nullable=False),
        sa.Column("metrics", JSONB(), nullable=False),
        sa.Column("payload_version", sa.BigInteger(), nullable=False),
        sa.ForeignKeyConstraint(
            ["document_id"], ["document.document.document_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("document_id"),
        schema="document",
    )


def downgrade() -> None:
    op.drop_table("evaluation", schema="document")
