"""soft delete districtrmap

Revision ID: 2494caf34886
Revises: 65a4fc0a727d
Create Date: 2024-11-18 09:37:23.352006

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2494caf34886"
down_revision: Union[str, None] = "65a4fc0a727d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "districtrmap",
        sa.Column("visible", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.execute(
        sa.text(
            """
            CREATE OR REPLACE FUNCTION create_districtr_map(
                map_name VARCHAR,
                gerrydb_table_name VARCHAR,
                num_districts INTEGER,
                tiles_s3_path VARCHAR,
                parent_layer_name VARCHAR,
                child_layer_name VARCHAR,
                visibility BOOLEAN DEFAULT TRUE
            )
            RETURNS UUID AS $$
            DECLARE
                inserted_districtr_uuid UUID;
            BEGIN
                INSERT INTO districtrmap (
                    created_at,
                    uuid,
                    name,
                    gerrydb_table_name,
                    num_districts,
                    tiles_s3_path,
                    parent_layer,
                    child_layer,
                    visible
                )
                VALUES (
                    now(),
                    gen_random_uuid(),
                    map_name,
                    gerrydb_table_name,
                    num_districts,
                    tiles_s3_path,
                    parent_layer_name,
                    child_layer_name,
                    visibility
                )
                RETURNING uuid INTO inserted_districtr_uuid;

                RETURN inserted_districtr_uuid;
            END;
            $$ LANGUAGE plpgsql;
            """
        )
    )


def downgrade() -> None:
    op.drop_column("districtrmap", "visible")
    op.execute(
        sa.text(
            """
            CREATE OR REPLACE FUNCTION create_districtr_map(
                map_name VARCHAR,
                gerrydb_table_name VARCHAR,
                num_districts INTEGER,
                tiles_s3_path VARCHAR,
                parent_layer_name VARCHAR,
                child_layer_name VARCHAR
            )
            RETURNS UUID AS $$
            DECLARE
                inserted_districtr_uuid UUID;
            BEGIN
                INSERT INTO districtrmap (
                    created_at,
                    uuid,
                    name,
                    gerrydb_table_name,
                    num_districts,
                    tiles_s3_path,
                    parent_layer,
                    child_layer
                )
                VALUES (now(), gen_random_uuid(), $1, $2, $3, $4, $5, $6)
                RETURNING uuid INTO inserted_districtr_uuid;
                RETURN inserted_districtr_uuid;
            END;
            $$ LANGUAGE plpgsql;
            """
        )
    )
