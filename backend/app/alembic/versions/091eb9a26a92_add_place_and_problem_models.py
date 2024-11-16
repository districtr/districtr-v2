"""add place and problem models

Revision ID: 091eb9a26a92
Revises: 65a4fc0a727d
Create Date: 2024-11-09 15:27:25.337956

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from app.models import UUIDType

# revision identifiers, used by Alembic.
revision: str = "091eb9a26a92"
branch_labels: Union[str, Sequence[str], None] = None
depends_on = "f86991e63a62"  # unshatter UDF
down_revision = "f86991e63a62"


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###

    # create schema for new districtr places and problems?
    # op.create_schema('districtr_places_and_problems')

    op.create_table(
        "districtrplace",
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("uuid", UUIDType(), nullable=False, primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("id", sa.String(), nullable=True),
        sa.Column("place_type", sa.String(), nullable=False),
        sa.Column("state", sa.String(), nullable=False),
        sa.Column("districtr_problems", postgresql.ARRAY(UUIDType()), nullable=True),
        sa.PrimaryKeyConstraint("uuid"),
        schema="public",
    )

    op.create_unique_constraint(
        "unique_id_place_type_state", "districtrplace", ["id", "place_type", "state"]
    )

    op.create_table(
        "districtrproblems",
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("uuid", UUIDType(), nullable=False, primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("num_parts", sa.Integer(), nullable=False),
        sa.Column("plural_noun", sa.String(), nullable=False),
        sa.Column("districtr_place_id", UUIDType(), nullable=False),
        schema="public",
    )

    op.create_unique_constraint(
        "unique_name_place_id", "districtrproblems", ["name", "districtr_place_id"]
    )

    op.alter_column(
        "districtrmap",
        "extent",
        existing_type=postgresql.ARRAY(sa.DOUBLE_PRECISION(precision=53)),
        nullable=True,
    )
    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.alter_column(
        "districtrmap",
        "extent",
        existing_type=postgresql.ARRAY(sa.DOUBLE_PRECISION(precision=53)),
        nullable=False,
    )
    # ### end Alembic commands ###
