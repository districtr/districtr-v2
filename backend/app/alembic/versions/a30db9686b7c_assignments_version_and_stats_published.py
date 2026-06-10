"""assignments_updated_at, stats_published_at, district_unions partial uniques

Revision ID: a30db9686b7c
Revises: b4e2f8a91c30
Create Date: 2026-06-09 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a30db9686b7c"
down_revision: Union[str, None] = "b4e2f8a91c30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Track when assignments specifically changed (separate from any-mutation
    # `updated_at`) so the per-zone stats cache survives unrelated document
    # edits like metadata or comment changes.
    op.execute(
        sa.text(
            "ALTER TABLE document.document "
            "ADD COLUMN assignments_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
        )
    )
    op.execute(
        sa.text(
            "UPDATE document.document SET assignments_updated_at = updated_at"
        )
    )

    # Track when the public stats GeoJSON was last successfully uploaded to S3,
    # so /stats can 307 to the CDN when the object is at least as fresh as the
    # assignments.
    op.execute(
        sa.text(
            "ALTER TABLE document.document "
            "ADD COLUMN stats_published_at TIMESTAMPTZ NULL"
        )
    )

    # Enable per-(document, zone) upserts in district_unions. Two partial
    # uniques because Postgres treats NULLs as distinct in normal unique
    # indexes — we need to forbid duplicate unassigned (NULL-zone) rows too.
    op.execute(
        sa.text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_district_unions_doc_zone "
            "ON document.district_unions (document_id, zone) WHERE zone IS NOT NULL"
        )
    )
    op.execute(
        sa.text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_district_unions_doc_unassigned "
            "ON document.district_unions (document_id) WHERE zone IS NULL"
        )
    )

    # Old cached rows pre-date the per-zone freshness model; clear so the next
    # /stats hit rebuilds with the new semantics.
    op.execute(sa.text("DELETE FROM document.district_unions"))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS document.ux_district_unions_doc_zone"))
    op.execute(
        sa.text("DROP INDEX IF EXISTS document.ux_district_unions_doc_unassigned")
    )
    op.execute(
        sa.text("ALTER TABLE document.document DROP COLUMN IF EXISTS stats_published_at")
    )
    op.execute(
        sa.text(
            "ALTER TABLE document.document DROP COLUMN IF EXISTS assignments_updated_at"
        )
    )
