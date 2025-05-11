"""create map groups

Revision ID: dc0216fef023
Revises: ea4bc886a999
Create Date: 2025-04-29 15:50:59.583224

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "dc0216fef023"
down_revision: Union[str, None] = "ea4bc886a999"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "map_group",
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("slug", sa.String(), primary_key=True, nullable=False),
    )
    op.create_table(
        "districtrmaps_to_groups",
        sa.Column("group_slug", sa.String(), nullable=False),
        sa.Column("districtrmap_uuid", sa.Uuid(), nullable=False),
        sa.PrimaryKeyConstraint(
            "group_slug", "districtrmap_uuid", name="group_map_unique"
        ),
        sa.ForeignKeyConstraint(["group_slug"], ["map_group.slug"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["districtrmap_uuid"], ["districtrmap.uuid"], ondelete="CASCADE"
        ),
    )
    op.execute(
        sa.text("INSERT INTO map_group (name, slug) VALUES ('States', 'states')")
    )
    op.execute(
        sa.text(
            "INSERT INTO districtrmaps_to_groups (group_slug, districtrmap_uuid) SELECT 'states', uuid from districtrmap"
        )
    )


def downgrade() -> None:
    op.drop_table("districtrmaps_to_groups")
    op.drop_table("map_group")
