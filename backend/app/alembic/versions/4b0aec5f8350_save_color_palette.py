"""save color palette

Revision ID: 4b0aec5f8350
Revises: f36266d50cf7
Create Date: 2025-03-03 13:38:10.774799

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4b0aec5f8350"
down_revision: Union[str, None] = "f36266d50cf7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "document",
        sa.Column("color_scheme", sa.ARRAY(sa.VARCHAR), nullable=True),
        schema="document",
    )


def downgrade() -> None:
    op.drop_column("document", "color_scheme", schema="document")
