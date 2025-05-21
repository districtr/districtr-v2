"""add map_type to create_districtr_map

Revision ID: 1cddbdcac008
Revises: af62f0e0276b
Create Date: 2025-05-21 17:42:38.502758

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from app.core.config import settings


# revision identifiers, used by Alembic.
revision: str = "1cddbdcac008"
down_revision: Union[str, None] = "af62f0e0276b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

udfs = ["create_districtr_map"]


def upgrade() -> None:
    for udf in udfs:
        op.execute(sa.text(f"DROP FUNCTION IF EXISTS {udf}"))

        with open(
            settings.SQL_DIR / "versions" / revision / f"{udf}_udf.sql", "r"
        ) as f:
            sql = f.read()
        op.execute(sa.text(sql))


def downgrade() -> None:
    for udf in udfs:
        op.execute(sa.text(f"DROP FUNCTION IF EXISTS {udf}"))

    for udf in udfs:
        with open(
            settings.SQL_DIR / "versions" / down_revision / f"{udf}_udf.sql", "r"
        ) as f:
            sql = f.read()
        op.execute(sa.text(sql))
