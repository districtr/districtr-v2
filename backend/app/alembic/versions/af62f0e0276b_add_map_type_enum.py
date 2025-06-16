"""Add map type enum

Revision ID: af62f0e0276b
Revises: 25416f500a9b
Create Date: 2025-05-19 01:50:18.044942

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from app.core.config import settings


# revision identifiers, used by Alembic.
revision: str = "af62f0e0276b"
down_revision: Union[str, None] = "25416f500a9b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

maptype_enum = postgresql.ENUM("default", "local", name="maptype", create_type=False)

udfs = ["create_districtr_map"]


def upgrade() -> None:
    maptype_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "districtrmap",
        sa.Column("map_type", maptype_enum, nullable=False, server_default="default"),
    )

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

    op.drop_column("districtrmap", "map_type")
    maptype_enum.drop(op.get_bind(), checkfirst=True)
