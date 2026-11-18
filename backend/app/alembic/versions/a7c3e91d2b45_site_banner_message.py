"""site banner message

Revision ID: a7c3e91d2b45
Revises: 55d7b369ed57
Create Date: 2026-11-18 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from app.constants import CMS_SCHEMA

# revision identifiers, used by Alembic.
revision: str = "a7c3e91d2b45"
down_revision: Union[str, None] = "55d7b369ed57"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "site_settings",
        sa.Column("banner_message", sa.Text(), nullable=True),
        schema=CMS_SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("site_settings", "banner_message", schema=CMS_SCHEMA)
