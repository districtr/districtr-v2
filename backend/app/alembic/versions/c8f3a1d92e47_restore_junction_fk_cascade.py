"""Restore ON DELETE CASCADE on the districtrmaps_to_groups FKs.

dc0216fef023 created both junction FKs with ondelete=CASCADE;
545e708aeb30 recreated them without it — apparently accidentally, since its
own downgrade() re-adds the CASCADE. The regression makes deleting a
DistrictrMap (e.g. Wagtail's snippet bulk delete) or a MapGroup fail with a
FK violation on the link table. Link rows are pure membership, so cascade is
correct — matching districtrmap_overlays, whose FKs kept it.

Revision ID: c8f3a1d92e47
Revises: ba6fafe520dc
"""

from typing import Sequence, Union

from alembic import op

revision: str = "c8f3a1d92e47"
down_revision: Union[str, None] = "ba6fafe520dc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "districtrmaps_to_groups"


def upgrade() -> None:
    op.drop_constraint("districtrmaps_to_groups_uuid", TABLE, type_="foreignkey")
    op.create_foreign_key(
        "districtrmaps_to_groups_uuid",
        TABLE,
        "districtrmap",
        ["districtrmap_uuid"],
        ["uuid"],
        ondelete="CASCADE",
    )
    op.drop_constraint("districtrmaps_to_groups_slug", TABLE, type_="foreignkey")
    op.create_foreign_key(
        "districtrmaps_to_groups_slug",
        TABLE,
        "map_group",
        ["group_slug"],
        ["slug"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("districtrmaps_to_groups_uuid", TABLE, type_="foreignkey")
    op.create_foreign_key(
        "districtrmaps_to_groups_uuid",
        TABLE,
        "districtrmap",
        ["districtrmap_uuid"],
        ["uuid"],
    )
    op.drop_constraint("districtrmaps_to_groups_slug", TABLE, type_="foreignkey")
    op.create_foreign_key(
        "districtrmaps_to_groups_slug",
        TABLE,
        "map_group",
        ["group_slug"],
        ["slug"],
    )
