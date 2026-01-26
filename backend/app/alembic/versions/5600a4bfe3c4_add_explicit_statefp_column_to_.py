"""Navajo Nation changes

Add explicit statefp column to districtrmap.
Remove add_parent_child_relationships procedure (replaced by raw SQL in CLI).

Revision ID: 5600a4bfe3c4
Revises: 0db008690d60
Create Date: 2026-01-26 18:38:15.010498

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.constants import SQL_DIR


# revision identifiers, used by Alembic.
revision: str = "5600a4bfe3c4"
down_revision: Union[str, None] = "0db008690d60"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ADD_PARENT_CHILD_RELATIONSHIPS_SQL = "parent_child_relationships.sql"


def upgrade() -> None:
    op.execute(sa.text("DROP PROCEDURE IF EXISTS add_parent_child_relationships(UUID)"))
    op.add_column(
        "districtrmap",
        sa.Column("statefps", sa.ARRAY(sa.String()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("districtrmap", "statefps")
    with (SQL_DIR / ADD_PARENT_CHILD_RELATIONSHIPS_SQL).open() as f:
        op.execute(sa.text(f.read()))
