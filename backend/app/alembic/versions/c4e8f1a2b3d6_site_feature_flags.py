"""site feature flags

Revision ID: c4e8f1a2b3d6
Revises: a7c3e91d2b45
Create Date: 2026-11-18 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from app.constants import CMS_SCHEMA

# revision identifiers, used by Alembic.
revision: str = "c4e8f1a2b3d6"
down_revision: Union[str, None] = "a7c3e91d2b45"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "site_settings",
        sa.Column("feature_flags", JSONB(), nullable=False, server_default="{}"),
        schema=CMS_SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("site_settings", "feature_flags", schema=CMS_SCHEMA)
