"""gerrydb tiles table

Revision ID: 5f766f22b550
Revises: b7adbf498feb
Create Date: 2024-08-04 16:12:02.937795

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import app.models
import sqlmodel.sql.sqltypes


revision: str = "5f766f22b550"
down_revision: Union[str, None] = "b7adbf498feb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "gerrydbtiles",
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("uuid", app.models.UUIDType(), nullable=False),
        sa.Column("table_uuid", app.models.UUIDType(), nullable=False),
        sa.Column("s3_path", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.ForeignKeyConstraint(
            ["table_uuid"],
            ["gerrydbtable.uuid"],
        ),
        sa.PrimaryKeyConstraint("uuid"),
        sa.UniqueConstraint("uuid"),
        sa.UniqueConstraint("table_uuid"),
    )


def downgrade() -> None:
    op.drop_table("gerrydbtiles")
