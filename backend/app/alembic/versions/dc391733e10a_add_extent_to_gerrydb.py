"""add extent to gerrydb

Revision ID: dc391733e10a
Revises: 5ab466c5650a
Create Date: 2024-10-27 19:38:13.798056

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "dc391733e10a"
down_revision: Union[str, None] = "5ab466c5650a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on = ("167892041d95",)  # geometry col renaming
down_revision = "167892041d95"


def upgrade() -> None:
    op.add_column(
        "districtrmap",
        sa.Column("extent", sa.ARRAY(sa.Float()), nullable=True, default=None),
    )

    op.execute(
        sa.text(
            """
        DO $$
        DECLARE
            rec RECORD;
            layer_extent GEOMETRY;
        BEGIN
            FOR rec IN
                SELECT uuid, parent_layer
                FROM districtrmap
            LOOP
                BEGIN
                    EXECUTE format('
                        SELECT ST_Extent(ST_Transform(geometry, 4326))
                        FROM gerrydb.%I',
                        rec.parent_layer
                    ) INTO layer_extent;

                    UPDATE districtrmap
                    SET extent = ARRAY[
                        ST_XMin(layer_extent),
                        ST_YMin(layer_extent),
                        ST_XMax(layer_extent),
                        ST_YMax(layer_extent)
                    ]
                    WHERE uuid = rec.uuid;

                EXCEPTION WHEN undefined_table THEN
                    RAISE NOTICE 'Table % does not exist for layer %', rec.parent_layer, rec.name;
                END;
            END LOOP;
        END $$;
        """
        )
    )


def downgrade() -> None:
    op.drop_column("districtrmap", "extent")
