"""get pop totals udf

Revision ID: 48a91c29aae9
Revises: 556843a0c3bf
Create Date: 2024-07-22 22:58:33.621016

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "48a91c29aae9"
down_revision: Union[str, None] = "556843a0c3bf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_column("gerrydbtable", "id")
    op.execute(
        sa.text("""
        CREATE OR REPLACE FUNCTION get_total_population(document_id UUID)
        RETURNS TABLE (zone TEXT, total_pop BIGINT) AS $$
        DECLARE
            gerrydb_table_name TEXT;
            sql_query TEXT;
        BEGIN
            SELECT gerrydb_table INTO gerrydb_table_name
            FROM document.document
            WHERE document.document_id = $1;
            sql_query := format('
                SELECT
                    assignments.zone::TEXT AS zone,
                    SUM(COALESCE(blocks.total_pop, 0))::BIGINT AS total_pop
                FROM document.assignments
                LEFT JOIN gerrydb.%I blocks
                ON blocks.path = assignments.geo_id
                WHERE assignments.document_id = $1
                GROUP BY assignments.zone
            ', gerrydb_table_name);
            RETURN QUERY EXECUTE sql_query USING $1;
        END;
        $$ LANGUAGE plpgsql;
    """)
    )
    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.execute(sa.text("DROP FUNCTION IF EXISTS get_total_population"))
    op.add_column(
        "gerrydbtable",
        sa.Column("id", sa.INTEGER(), autoincrement=True, nullable=False),
    )
    # ### end Alembic commands ###
