"""Add document_type enum and column to document

Revision ID: 7193bc09104c
Revises: da39a3ee5e6b
Create Date: 2026-02-23

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "7193bc09104c"
down_revision: Union[str, None] = "da39a3ee5e6b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

documenttype_enum = postgresql.ENUM(
    "district", "coi", name="documenttype", create_type=False
)


def upgrade() -> None:
    documenttype_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "document",
        sa.Column(
            "document_type",
            documenttype_enum,
            nullable=False,
            server_default="district",
        ),
        schema="document",
    )


def downgrade() -> None:
    op.drop_column("document", "document_type", schema="document")
    documenttype_enum.drop(op.get_bind(), checkfirst=True)
