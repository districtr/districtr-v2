"""add county_demographics table

Revision ID: b4e2f8a91c30
Revises: aa7a1c749ac0
Create Date: 2026-05-05 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSON

# revision identifiers, used by Alembic.
revision: str = "b4e2f8a91c30"
down_revision: Union[str, None] = "aa7a1c749ac0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS evaluation")
    op.create_table(
        "county_demographics",
        sa.Column("geoid", sa.Text(), nullable=False),
        sa.Column("state_fips", sa.Text(), nullable=False),
        sa.Column("total_pop", sa.Integer(), nullable=True),
        sa.Column("demographic_data", JSON(), nullable=True),
        sa.PrimaryKeyConstraint("geoid"),
        schema="evaluation",
    )
    op.create_index(
        "ix_county_demographics_state_fips",
        "county_demographics",
        ["state_fips"],
        schema="evaluation",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_county_demographics_state_fips",
        table_name="county_demographics",
        schema="evaluation",
    )
    op.drop_table("county_demographics", schema="evaluation")
