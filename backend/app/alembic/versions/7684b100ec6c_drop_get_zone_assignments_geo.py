"""drop get_zone_assignments_geo

The district-union rebuild (update_or_select_district_stats) now joins the
map's layers itself, filtered to the zones it redraws. This PL/pgSQL function
returned every unit of the plan before the caller's zone filter could apply,
so each rebuild read the whole plan's geometry. Nothing else calls it.

Dropping a function takes no table locks.

Revision ID: 7684b100ec6c
Revises: 55d7b369ed57
Create Date: 2026-11-10

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.constants import SQL_DIR

# revision identifiers, used by Alembic.
revision: str = "7684b100ec6c"
down_revision: Union[str, None] = "55d7b369ed57"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("DROP FUNCTION IF EXISTS get_zone_assignments_geo(UUID)"))


def downgrade() -> None:
    # Recreates the last definition. The file stays in app/alembic/sql: older
    # revisions (552ac8c1defd, fa7d5c356d1f) create the function from it.
    with open(f"{SQL_DIR}/export_zone_assignments_geo.sql") as f:
        op.execute(sa.text(f.read()))
