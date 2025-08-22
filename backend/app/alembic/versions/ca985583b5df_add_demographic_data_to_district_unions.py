"""add_demographic_data_to_district_unions

Revision ID: ca985583b5df
Revises: dc7408074929
Create Date: 2025-08-22 14:53:41.206948

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON


# revision identifiers, used by Alembic.
revision: str = "ca985583b5df"
down_revision: Union[str, None] = "dc7408074929"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add demographic_data column to district_unions table
    op.add_column(
        "district_unions",
        sa.Column("demographic_data", JSON, nullable=True),
        schema="document",
    )


def downgrade() -> None:
    # Remove demographic_data column
    op.drop_column("district_unions", "demographic_data", schema="document")
