"""migrate to districtrmap

Revision ID: 5ab466c5650a
Revises: 5c4028ff26df
Create Date: 2024-10-09 22:41:59.024334

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "5ab466c5650a"
down_revision: Union[str, None] = "5c4028ff26df"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text("""
        INSERT INTO districtrmap
        SELECT
           	now() as created_at,
           	now() AS updated_at,
           	gen_random_uuid() as uuid,
           	CONCAT(
          		UPPER(SUBSTRING(name, 1, 2)),
          		' ',
          		REPLACE(
         			REPLACE(SUBSTRING(name, 4), 'vtd', 'VTD'),
         			'_',
         			' '
          		)
           	) as name,
           	name as gerrydb_table_name,
           	NULL as num_districts,
           	CONCAT('tilesets/', name, '.pmtiles') AS tiles_s3_path,
           	name AS parent_layer,
           	NULL as child_layer
        FROM gerrydbtable;
        """)
    )


def downgrade() -> None:
    # Roll forwards only
    pass
