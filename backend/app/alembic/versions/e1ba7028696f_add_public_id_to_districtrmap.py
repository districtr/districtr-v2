"""Add public_id to DistrictrMap

Revision ID: e1ba7028696f
Revises: 545e708aeb30
Create Date: 2025-07-07 13:36:26.214887

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "e1ba7028696f"
down_revision: Union[str, None] = "545e708aeb30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "map_document_token",
        sa.Column("public_id", sa.Integer(), nullable=True),
        schema="document",
    )
    op.create_unique_constraint(
        "uq_document_public_id", "map_document_token", ["public_id"], schema="document"
    )
    # update public_id to be row number
    op.execute(
        sa.text("""
            WITH numbered_tokens AS (
                SELECT token_id, row_number() OVER (ORDER BY token_id) AS rn
                FROM document.map_document_token
            )
            UPDATE document.map_document_token AS t
            SET public_id = n.rn
            FROM numbered_tokens AS n
            WHERE t.token_id = n.token_id;
        """),
    )


def downgrade() -> None:
    op.drop_constraint("uq_document_public_id", "map_document_token", schema="document")
    op.drop_column("map_document_token", "public_id", schema="document")
