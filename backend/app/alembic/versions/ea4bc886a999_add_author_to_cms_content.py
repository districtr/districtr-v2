"""add author to cms content

Revision ID: ea4bc886a999
Revises: 8b06a98951aa
Create Date: 2025-04-05 22:05:41.801663

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from app.constants import CMS_SCHEMA


revision: str = "ea4bc886a999"
down_revision: Union[str, None] = "8b06a98951aa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tags_content",
        sa.Column("author", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        schema=CMS_SCHEMA,
    )
    op.add_column(
        "places_content",
        sa.Column("author", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        schema=CMS_SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("places_content", "author", schema=CMS_SCHEMA)
    op.drop_column("tags_content", "author", schema=CMS_SCHEMA)
