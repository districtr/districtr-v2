"""departition assignments tables

Replace per-document LIST partitioning of document.assignments and
document.community_assignments with plain tables. CREATE TABLE ... PARTITION OF
takes an ACCESS EXCLUSIVE lock on the parent, so every document creation (and
the reset endpoint's DROP+CREATE) globally blocked all assignment reads and
writes — the lock convoy that collapsed stress runs 1 and 2 (see
backend/stress_test/RUN2_FINDINGS.md). Plain tables take row locks only.

Revision ID: 7e57b49573e0
Revises: 3e2c40e7d148
Create Date: 2026-07-16 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7e57b49573e0"
down_revision: Union[str, None] = "3e2c40e7d148"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Serialize against all app writers for the whole transaction. Without
    # this, a write committing between the INSERT..SELECT and the DROP would
    # be silently lost.
    op.execute("LOCK TABLE document.assignments IN ACCESS EXCLUSIVE MODE")
    op.execute("LOCK TABLE document.community_assignments IN ACCESS EXCLUSIVE MODE")

    op.execute(
        """
        CREATE TABLE document.assignments_new (
            document_id UUID NOT NULL,
            geo_id VARCHAR NOT NULL,
            zone INTEGER
        )
        """
    )
    op.execute(
        """
        INSERT INTO document.assignments_new (document_id, geo_id, zone)
        SELECT document_id, geo_id, zone FROM document.assignments
        """
    )
    # CASCADE drops every per-document partition (public."document.assignments_<uuid>")
    op.execute("DROP TABLE document.assignments CASCADE")
    op.execute("ALTER TABLE document.assignments_new RENAME TO assignments")
    # PK added after the bulk load: one fast index build instead of
    # incremental maintenance. Old PK was named document_geo_id_unique.
    op.execute(
        """
        ALTER TABLE document.assignments
        ADD CONSTRAINT assignments_pkey PRIMARY KEY (document_id, geo_id)
        """
    )

    op.execute(
        """
        CREATE TABLE document.community_assignments_new (
            document_id UUID NOT NULL,
            community_id SMALLINT NOT NULL,
            geo_id VARCHAR NOT NULL
        )
        """
    )
    op.execute(
        """
        INSERT INTO document.community_assignments_new (document_id, community_id, geo_id)
        SELECT document_id, community_id, geo_id FROM document.community_assignments
        """
    )
    op.execute("DROP TABLE document.community_assignments CASCADE")
    op.execute("ALTER TABLE document.community_assignments_new RENAME TO community_assignments")
    op.execute(
        """
        ALTER TABLE document.community_assignments
        ADD CONSTRAINT community_assignments_pkey
        PRIMARY KEY (document_id, community_id, geo_id)
        """
    )
    # Intentionally not recreated:
    #  - ix_document_community_assignments_community_id / _geo_id: every query
    #    filters on document_id first, so the PK prefix covers them; dropping
    #    them removes index write amplification on the full-rewrite save path.

    # Legacy DB UDFs that emit CREATE TABLE ... PARTITION OF — unused by app
    # code and broken against plain tables. Their .sql source files stay on
    # disk: b7adbf498feb / fa7d5c356d1f read them at upgrade time on fresh DBs.
    op.execute("DROP FUNCTION IF EXISTS create_document(TEXT)")
    op.execute("DROP FUNCTION IF EXISTS create_assignment_partition_sql(TEXT)")

    # Fresh tables have no planner stats until autoanalyze runs.
    op.execute("ANALYZE document.assignments")
    op.execute("ANALYZE document.community_assignments")


def downgrade() -> None:
    raise NotImplementedError(
        "Irreversible: restoring per-document LIST partitioning would require "
        "one CREATE TABLE ... PARTITION OF per existing document, recreating "
        "the design this migration removes. Roll back via DB snapshot."
    )
