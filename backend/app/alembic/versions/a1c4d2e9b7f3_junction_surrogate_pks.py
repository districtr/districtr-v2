"""Add surrogate integer PKs to map-group and overlay junction tables

Composite primary keys block row editing in external admin tooling
(Django/Wagtail forms require a single-column PK). The original column
pairs are preserved as UNIQUE constraints.

Revision ID: a1c4d2e9b7f3
Revises: b4e2f8a91c30
Create Date: 2026-06-10 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1c4d2e9b7f3"
down_revision: Union[str, None] = "b4e2f8a91c30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # districtrmaps_to_groups: composite PK constraint is named group_map_unique
    op.execute("ALTER TABLE districtrmaps_to_groups ADD COLUMN id SERIAL")
    op.execute("ALTER TABLE districtrmaps_to_groups DROP CONSTRAINT group_map_unique")
    op.execute("ALTER TABLE districtrmaps_to_groups ADD PRIMARY KEY (id)")
    op.execute(
        "ALTER TABLE districtrmaps_to_groups "
        "ADD CONSTRAINT group_map_unique UNIQUE (districtrmap_uuid, group_slug)"
    )

    # districtrmap_overlays: composite PK constraint is named districtrmap_overlays_pkey
    op.execute("ALTER TABLE districtrmap_overlays ADD COLUMN id SERIAL")
    op.execute(
        "ALTER TABLE districtrmap_overlays DROP CONSTRAINT districtrmap_overlays_pkey"
    )
    op.execute("ALTER TABLE districtrmap_overlays ADD PRIMARY KEY (id)")
    op.execute(
        "ALTER TABLE districtrmap_overlays "
        "ADD CONSTRAINT districtrmap_overlays_unique UNIQUE (districtr_map_id, overlay_id)"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE districtrmap_overlays DROP CONSTRAINT districtrmap_overlays_unique"
    )
    op.execute(
        "ALTER TABLE districtrmap_overlays DROP CONSTRAINT districtrmap_overlays_pkey"
    )
    op.execute("ALTER TABLE districtrmap_overlays DROP COLUMN id")
    op.execute(
        "ALTER TABLE districtrmap_overlays "
        "ADD CONSTRAINT districtrmap_overlays_pkey PRIMARY KEY (districtr_map_id, overlay_id)"
    )

    op.execute("ALTER TABLE districtrmaps_to_groups DROP CONSTRAINT group_map_unique")
    op.execute(
        "ALTER TABLE districtrmaps_to_groups DROP CONSTRAINT districtrmaps_to_groups_pkey"
    )
    op.execute("ALTER TABLE districtrmaps_to_groups DROP COLUMN id")
    op.execute(
        "ALTER TABLE districtrmaps_to_groups "
        "ADD CONSTRAINT group_map_unique PRIMARY KEY (group_slug, districtrmap_uuid)"
    )
