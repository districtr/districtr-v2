"""rename geometry cols to geometry

Revision ID: 167892041d95
Revises: 5ab466c5650a
Create Date: 2024-10-27 18:38:13.798056

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "167892041d95"
down_revision: Union[str, None] = "5ab466c5650a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text("""
        DO
        $$
        DECLARE
            rec RECORD;
            sql TEXT;
        BEGIN
            FOR rec IN
                WITH all_geom_cols AS (
			SELECT f_table_schema, f_table_name, ARRAY_AGG(f_geometry_column) f_geometry_column_arr, type, srid
			FROM public.geometry_columns GROUP BY f_table_schema, f_table_name,f_geometry_column, type, srid
		)
		SELECT f_table_schema, f_table_name, f_geometry_column, type, srid
		FROM all_geom_cols,
			UNNEST(f_geometry_column_arr) f_geometry_column
                WHERE 'geometry' != ANY(f_geometry_column_arr)
            LOOP
                sql := format('
			ALTER TABLE %I.%I DROP COLUMN IF EXISTS geometry;
                    SELECT AddGeometryColumn(%L, %L, ''geometry'', %L, %L, 2);

                    UPDATE %I.%I
                    SET geometry = %I;

                    ALTER TABLE %I.%I
                    DROP COLUMN %I;
                ',
			rec.f_table_schema, rec.f_table_name,
                    rec.f_table_schema, rec.f_table_name, rec.srid, rec.type,
                    rec.f_table_schema, rec.f_table_name,
                    rec.f_geometry_column,
                    rec.f_table_schema, rec.f_table_name,
                    rec.f_geometry_column
                );
                EXECUTE sql;
            END LOOP;
        END
        $$;
        """)
    )


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    pass  # This is a one-way migration
    # ### end Alembic commands ###
