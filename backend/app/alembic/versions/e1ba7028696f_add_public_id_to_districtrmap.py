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
down_revision: Union[str, None] = "239ca64ca70d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "document",
        sa.Column("public_id", sa.Integer(), nullable=True),
        schema="document",
    )
    op.create_unique_constraint(
        "uq_document_public_id", "document", ["public_id"], schema="document"
    )
    # update public_id to be row number
    op.execute(
        sa.text("""
            WITH numbered_documents AS (
                SELECT document_id, row_number() OVER (ORDER BY document_id) AS rn
                FROM document.document
            )
            UPDATE document.document AS t
            SET public_id = n.rn
            FROM numbered_documents AS n
            WHERE t.document_id = n.document_id;
        """),
    )


def downgrade() -> None:
    op.drop_constraint("uq_document_public_id", "document", schema="document")
    op.drop_column("document", "public_id", schema="document")
