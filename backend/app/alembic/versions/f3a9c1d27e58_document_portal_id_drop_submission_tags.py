"""document.portal_id replaces submissions.tags

A map belongs to at most one portal. This records that on the document
(stamped at creation for maps started from a portal page, on the clone for
form and finalize submissions) and drops the free-form tags array on
submissions, which had already been ruled out for gallery visibility.

Legacy galleries also matched maps on document.map_metadata.tags, stamped by
production's CreateButton. Nothing backfills those into portal membership:
the cutover runbook converts each tag-filtered plan gallery into curated ids.

The backfill takes each map's earliest submission's portal. Production has no
map in two portals, so the choice never applies there.

Revision ID: f3a9c1d27e58
Revises: e4a7c318b9d2
Create Date: 2026-09-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

revision: str = "f3a9c1d27e58"
down_revision: Union[str, None] = "e4a7c318b9d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "document",
        sa.Column("portal_id", sa.String(length=255), nullable=True),
        schema="document",
    )
    op.create_foreign_key(
        "document_portal_id_fkey",
        "document",
        "form_configs",
        ["portal_id"],
        ["portal_id"],
        source_schema="document",
        referent_schema="comments",
        onupdate="CASCADE",
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_document_document_portal_id", "document", ["portal_id"], schema="document"
    )
    op.execute(
        """
        UPDATE document.document AS d
        SET portal_id = s.portal_id
        FROM (
            SELECT DISTINCT ON (map_public_id) map_public_id, portal_id
            FROM comments.submissions
            WHERE map_public_id IS NOT NULL
            ORDER BY map_public_id, created_at, id
        ) AS s
        WHERE d.public_id = s.map_public_id
        """
    )
    op.drop_index("idx_submissions_tags", table_name="submissions", schema="comments")
    op.drop_column("submissions", "tags", schema="comments")


def downgrade() -> None:
    op.add_column(
        "submissions",
        sa.Column(
            "tags",
            ARRAY(sa.String(length=255)),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        schema="comments",
    )
    op.execute("UPDATE comments.submissions SET tags = ARRAY[portal_id]")
    op.create_index(
        "idx_submissions_tags",
        "submissions",
        ["tags"],
        schema="comments",
        postgresql_using="gin",
    )
    op.drop_index(
        "ix_document_document_portal_id", table_name="document", schema="document"
    )
    op.drop_constraint(
        "document_portal_id_fkey", "document", schema="document", type_="foreignkey"
    )
    op.drop_column("document", "portal_id", schema="document")
