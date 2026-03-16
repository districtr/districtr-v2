"""add community_assignments table

Revision ID: dfc8a42b3632
Revises: 112a59ed50a2
Create Date: 2026-03-17 08:07:58.772342

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from app.core.models import UUIDType

# revision identifiers, used by Alembic.
revision: str = "dfc8a42b3632"
down_revision: Union[str, None] = "112a59ed50a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "community_assignments",
        sa.Column("document_id", UUIDType(), nullable=False),
        sa.Column("community_id", sa.SmallInteger(), nullable=False),
        sa.Column("geo_id", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("document_id", "community_id", "geo_id"),
        sa.UniqueConstraint(
            "document_id",
            "community_id",
            "geo_id",
            name="document_community_geo_id_unique",
        ),
        schema="document",
        postgresql_partition_by="LIST (document_id)",
    )
    op.create_index(
        "ix_document_community_assignments_community_id",
        "community_assignments",
        ["community_id"],
        unique=False,
        schema="document",
    )
    op.create_index(
        "ix_document_community_assignments_geo_id",
        "community_assignments",
        ["geo_id"],
        unique=False,
        schema="document",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_document_community_assignments_geo_id",
        table_name="community_assignments",
        schema="document",
    )
    op.drop_index(
        "ix_document_community_assignments_community_id",
        table_name="community_assignments",
        schema="document",
    )
    op.drop_table("community_assignments", schema="document")
