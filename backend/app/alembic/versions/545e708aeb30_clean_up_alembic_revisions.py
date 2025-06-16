"""Clean up alembic revisions

Revision ID: 545e708aeb30
Revises: af62f0e0276b
Create Date: 2025-06-15 20:57:44.673168

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "545e708aeb30"
down_revision: Union[str, None] = "af62f0e0276b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(
        "districtrmaps_to_groups_districtrmap_uuid_fkey",
        "districtrmaps_to_groups",
        type_="foreignkey",
    )
    op.drop_constraint(
        "districtrmaps_to_groups_group_slug_fkey",
        "districtrmaps_to_groups",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "districtrmaps_to_groups_uuid",
        "districtrmaps_to_groups",
        "districtrmap",
        ["districtrmap_uuid"],
        ["uuid"],
    )
    op.create_foreign_key(
        "districtrmaps_to_groups_slug",
        "districtrmaps_to_groups",
        "map_group",
        ["group_slug"],
        ["slug"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "districtrmaps_to_groups_uuid", "districtrmaps_to_groups", type_="foreignkey"
    )
    op.drop_constraint(
        "districtrmaps_to_groups_slug", "districtrmaps_to_groups", type_="foreignkey"
    )
    op.create_foreign_key(
        "districtrmaps_to_groups_group_slug_fkey",
        "districtrmaps_to_groups",
        "map_group",
        ["group_slug"],
        ["slug"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "districtrmaps_to_groups_districtrmap_uuid_fkey",
        "districtrmaps_to_groups",
        "districtrmap",
        ["districtrmap_uuid"],
        ["uuid"],
        ondelete="CASCADE",
    )
