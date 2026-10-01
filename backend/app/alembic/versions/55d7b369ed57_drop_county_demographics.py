"""drop county_demographics table

County data for the splits and Eguia metrics is aggregated per parent layer on
first request and held in backend process memory (`CountyContext`); this table
is no longer read or written. It held only derived data, so the downgrade
recreates it empty and it refills on demand.

Revision ID: 55d7b369ed57
Revises: f1c6a3d85b20
Create Date: 2026-10-01

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSON

# revision identifiers, used by Alembic.
revision: str = "55d7b369ed57"
down_revision: Union[str, None] = "f1c6a3d85b20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index(
        "ix_county_demographics_gerrydb_table_name",
        table_name="county_demographics",
        schema="evaluation",
    )
    op.drop_table("county_demographics", schema="evaluation")
    op.execute("DROP SCHEMA evaluation")


def downgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS evaluation")
    op.create_table(
        "county_demographics",
        sa.Column("geoid", sa.Text(), nullable=False),
        sa.Column("gerrydb_table_name", sa.Text(), nullable=False),
        sa.Column("total_pop", sa.Integer(), nullable=True),
        sa.Column("demographic_data", JSON(), nullable=True),
        sa.PrimaryKeyConstraint("geoid", "gerrydb_table_name"),
        schema="evaluation",
    )
    op.create_index(
        "ix_county_demographics_gerrydb_table_name",
        "county_demographics",
        ["gerrydb_table_name"],
        schema="evaluation",
    )
