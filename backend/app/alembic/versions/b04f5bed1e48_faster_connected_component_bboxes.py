"""faster connected component bboxes

Revision ID: b04f5bed1e48
Revises: 518ab28c5fd6
Create Date: 2025-03-23 18:22:09.793187

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from app.core.config import settings


# revision identifiers, used by Alembic.
revision: str = "b04f5bed1e48"
down_revision: Union[str, None] = "518ab28c5fd6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    udfs = [
        str(settings.SQL_DIR / u)
        for u in [
            "get_block_zone_assignments_bboxes.sql",
            "get_block_zone_assignments_geo.sql",
        ]
    ]
    for udf in udfs:
        with open(udf, "r") as f:
            sql = f.read()
        op.execute(sa.text(sql))


def downgrade() -> None:
    op.execute(
        sa.text("DROP FUNCTION IF EXISTS get_block_assignments_bboxes(UUID, INTEGER[])")
    )
    # Don't downgrade get_block_zone_assignments_geo because it was broken
