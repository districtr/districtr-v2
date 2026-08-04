"""site settings

Revision ID: 3e2c40e7d148
Revises: b4e2f8a91c30
Create Date: 2026-07-06 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from app.constants import CMS_SCHEMA

# revision identifiers, used by Alembic.
revision: str = "3e2c40e7d148"
down_revision: Union[str, None] = "b4e2f8a91c30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "site_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "under_construction",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema=CMS_SCHEMA,
    )
    op.execute(f"INSERT INTO {CMS_SCHEMA}.site_settings (id) VALUES (1)")


def downgrade() -> None:
    op.drop_table("site_settings", schema=CMS_SCHEMA)
