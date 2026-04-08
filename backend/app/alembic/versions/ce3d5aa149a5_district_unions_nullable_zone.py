"""district_unions nullable zone and geometry

Revision ID: ce3d5aa149a5
Revises: 112a59ed50a2
Create Date: 2026-03-27 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ce3d5aa149a5"
down_revision: Union[str, None] = "112a59ed50a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE document.district_unions ALTER COLUMN zone DROP NOT NULL")
    op.execute(
        "ALTER TABLE document.district_unions ALTER COLUMN geometry DROP NOT NULL"
    )
    # Clear cached data so unassigned rows get generated on next request
    op.execute("DELETE FROM document.district_unions")


def downgrade() -> None:
    op.execute("DELETE FROM document.district_unions WHERE zone IS NULL")
    op.execute("ALTER TABLE document.district_unions ALTER COLUMN zone SET NOT NULL")
    op.execute(
        "ALTER TABLE document.district_unions ALTER COLUMN geometry SET NOT NULL"
    )
