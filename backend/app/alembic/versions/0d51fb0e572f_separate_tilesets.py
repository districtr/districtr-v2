"""separate_tilesets

Revision ID: 0d51fb0e572f
Revises: 518ab28c5fd6
Create Date: 2025-03-21 18:18:22.714289

"""

from typing import Sequence, Union

from alembic import op
from app.constants import SQL_DIR
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0d51fb0e572f"
down_revision: Union[str, None] = "518ab28c5fd6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Add columns
    op.add_column(
        "districtrmap", sa.Column("parent_tiles_s3_path", sa.String(), nullable=True)
    )
    op.add_column(
        "districtrmap", sa.Column("child_tiles_s3_path", sa.String(), nullable=True)
    )

    # Update columns with formatted values
    op.execute(
        """
        UPDATE public.districtrmap
        SET parent_tiles_s3_path = 'tilesets/' || parent_layer || '.pmtiles',
            child_tiles_s3_path = CASE
                WHEN child_layer IS NOT NULL THEN 'tilesets/' || child_layer || '.pmtiles'
                ELSE NULL
            END
        """
    )
    # update create_distrctr_map_udf
    with open(SQL_DIR / "create_districtr_map_udf.sql") as f:
        op.execute(f.read())


def downgrade() -> None:
    # Drop columns
    op.drop_column("districtrmap", "parent_tiles_s3_path")
    op.drop_column("districtrmap", "child_tiles_s3_path")
    # use 518ab28c5fd6/create_districtr_map_udf.sql
    with open(SQL_DIR / "versions" / "518ab28c5fd6" / "create_districtr_map_udf.sql") as f:
        op.execute(f.read())
    pass
