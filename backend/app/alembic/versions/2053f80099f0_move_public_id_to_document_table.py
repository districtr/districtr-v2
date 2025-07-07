"""move_public_id_to_document_table

Revision ID: 2053f80099f0
Revises: e1ba7028696f
Create Date: 2025-07-07 14:59:53.552483

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2053f80099f0"
down_revision: Union[str, None] = "e1ba7028696f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add public_id column to document table
    op.add_column(
        "document",
        sa.Column("public_id", sa.Integer(), nullable=True),
        schema="document",
    )
    op.create_unique_constraint(
        "uq_document_public_id", "document", ["public_id"], schema="document"
    )

    # Copy data from districtrmap.public_id to document.public_id
    # Only copy to the first document per map that is in ready_to_share status
    op.execute("""
        WITH first_docs AS (
            SELECT DISTINCT ON (dm.districtr_map_slug) 
                d.document_id, dm.public_id
            FROM public.districtrmap dm 
            JOIN document.document d ON dm.districtr_map_slug = d.districtr_map_slug 
            WHERE dm.public_id IS NOT NULL
            AND d.map_metadata->>'draft_status' = 'ready_to_share'
            ORDER BY dm.districtr_map_slug, d.created_at ASC
        )
        UPDATE document.document 
        SET public_id = first_docs.public_id 
        FROM first_docs 
        WHERE document.document_id = first_docs.document_id
    """)

    # Remove public_id from districtrmap table
    op.drop_index("idx_districtrmap_public_id", table_name="districtrmap")
    op.drop_column("districtrmap", "public_id")


def downgrade() -> None:
    # Add public_id back to districtrmap table
    op.add_column("districtrmap", sa.Column("public_id", sa.Integer(), nullable=True))
    op.create_index(
        "idx_districtrmap_public_id", "districtrmap", ["public_id"], unique=True
    )

    # Copy data back from document.public_id to districtrmap.public_id
    op.execute("""
        UPDATE public.districtrmap 
        SET public_id = d.public_id 
        FROM document.document d 
        WHERE districtrmap.districtr_map_slug = d.districtr_map_slug 
        AND d.public_id IS NOT NULL
    """)

    # Remove public_id from document table
    op.drop_constraint("uq_document_public_id", "document", schema="document")
    op.drop_column("document", "public_id", schema="document")
