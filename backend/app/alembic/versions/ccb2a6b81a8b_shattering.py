"""shattering

Revision ID: ccb2a6b81a8b
Revises: 8437ce954087
Create Date: 2024-09-13 09:44:34.534198

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import app.models
import sqlmodel.sql.sqltypes
from pathlib import Path

SQL_PATH = Path(__file__).parent.parent.parent / "sql"


# revision identifiers, used by Alembic.
revision: str = "ccb2a6b81a8b"
down_revision: Union[str, None] = "8437ce954087"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table(
        "districtrmap",
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
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column(
            "gerrydb_table_name", sqlmodel.sql.sqltypes.AutoString(), nullable=True
        ),
        sa.Column("num_districts", sa.Integer(), nullable=True),
        sa.Column("tiles_s3_path", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("parent_layer", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("child_layer", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.ForeignKeyConstraint(
            ["child_layer"],
            ["gerrydbtable.name"],
        ),
        sa.ForeignKeyConstraint(
            ["parent_layer"],
            ["gerrydbtable.name"],
        ),
        sa.PrimaryKeyConstraint("uuid"),
        sa.UniqueConstraint("uuid"),
    )
    op.create_table(
        "parentchildedges",
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
        sa.Column("districtr_map", app.models.UUIDType(), nullable=False),
        sa.Column("parent_path", sa.String(), nullable=False),
        sa.Column("child_path", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(
            ["districtr_map"],
            ["districtrmap.uuid"],
        ),
        sa.PrimaryKeyConstraint("districtr_map", "parent_path", "child_path"),
    )
    op.drop_column("gerrydbtable", "tiles_s3_path")
    # ### end Alembic commands ###

    for file_name in [
        "parent_child_relationships.sql",
        "create_shatterable_gerrydb_view.sql",
        "create_districtr_map_udf.sql",
    ]:
        with open(SQL_PATH / file_name, "r") as f:
            sql = f.read()
            op.execute(sql)


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.add_column(
        "gerrydbtable",
        sa.Column("tiles_s3_path", sa.VARCHAR(), autoincrement=False, nullable=True),
    )
    op.drop_table("parentchildedges")
    op.drop_table("districtrmap")
    # ### end Alembic commands ###

    for func_name in [
        "add_parent_child_relationships",
        "create_shatterable_gerrydb_view",
        "create_districtr_map",
    ]:
        sql = f"DROP FUNCTION IF EXISTS {func_name}"
        op.execute(sql)
