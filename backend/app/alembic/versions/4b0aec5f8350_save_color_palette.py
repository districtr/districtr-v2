"""save color palette

Revision ID: 4b0aec5f8350
Revises: 119dcf98993f
Create Date: 2025-03-03 13:38:10.774799

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4b0aec5f8350"
down_revision: Union[str, None] = "119dcf98993f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # check if column exists
    conn = op.get_bind()
    inspector = sa.engine.reflection.Inspector.from_engine(conn)
    columns = inspector.get_columns("document", schema="document")
    if "color_scheme" in [column["name"] for column in columns]:
        return
    op.add_column(
        "document",
        sa.Column("color_scheme", sa.ARRAY(sa.VARCHAR), nullable=True),
        schema="document",
    )


def downgrade() -> None:
    op.drop_column("document", "color_scheme", schema="document")
