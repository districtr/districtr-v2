"""store each document's assignments as one jsonb row

Moves district assignments from one `document.assignments` row per unit to one
`document.document_assignments` row per document holding `{geo_id: zone}`
(about 30x smaller on disk). `document.assignments` becomes a read-only view
that expands the jsonb, so every reader (district_unions rebuild, contiguity,
thumbnails, exports, evaluation, get_assignments) is unchanged; only writers
target the new table. Rationale and benchmarks: docs/adr/0068.

community_assignments is untouched (a geo_id can belong to several
communities, so it doesn't fit a {geo_id: zone} object).

Locking: ACCESS EXCLUSIVE on document.assignments for the whole migration, so
reads and writes of assignments wait until it commits. Its time scales with the
table's size: locally 9.2M rows (1.4 GB) took about 9 s. Check
pg_total_relation_size('document.assignments') on the target first; app
requests that wait longer than their 15 s lock_timeout fail with a 504. The
lock is taken up front on purpose. Taking EXCLUSIVE (reads continue) and
upgrading at the DROP deadlocks with any old-code save that has read the table
and is waiting to delete from it, and Postgres aborts the migration. If the
lock can't be had within 10 s (a long reader holds the table) the migration
fails without changing anything and is safe to re-run.

Rollout: saves, resets, uploads and copies from API tasks still on the old
code fail between this migration and the new tasks' rollout; clients keep the
edits in IndexedDB and the next autosave retries. Old tasks keep reading
through the view, which has the old table's column types.

Rollback: an image rollback alone leaves the old code on the new schema, where
every district save fails (the ECS circuit breaker does this by itself if the
new tasks don't stabilise). The old image doesn't have this revision, so the
downgrade must run from the new image: a one-off migrate task with the command
`alembic downgrade 55d7b369ed57`, then deploy the old image with
`force_migrations` (infra/README.md, "Rollback").

Downgrade rebuilds the plain table with the same rows, under the same lock.
Documents saved with an empty plan keep no rows either way.

Revision ID: 71fa732b1bbc
Revises: 55d7b369ed57
Create Date: 2026-11-07

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "71fa732b1bbc"
down_revision: Union[str, None] = "55d7b369ed57"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# One row per (document, unit), with the old table's column types: a statement
# an old API task prepared against the table fails ("cached plan must not
# change result type") if geo_id comes back as text. `#>> '{}'` turns a jsonb
# number or null into text/NULL before the cast.
EXPAND_ROWS = """
    SELECT a.document_id, e.key::varchar AS geo_id,
           (e.value #>> '{}')::integer AS zone
    FROM document.document_assignments a
    CROSS JOIN LATERAL jsonb_each(a.assignments) AS e
"""


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.execute("LOCK TABLE document.assignments IN ACCESS EXCLUSIVE MODE")
    op.execute("SET LOCAL lock_timeout = DEFAULT")
    op.execute(
        "CREATE TABLE document.document_assignments ("
        " document_id UUID PRIMARY KEY,"
        " assignments JSONB NOT NULL DEFAULT '{}'::jsonb)"
    )
    # Group by streaming the PK in document order: hash aggregation would hold
    # every document's partial object in memory at once.
    op.execute("SET LOCAL enable_hashagg = off")
    op.execute(
        "INSERT INTO document.document_assignments (document_id, assignments) "
        "SELECT document_id, jsonb_object_agg(geo_id, zone) "
        "FROM document.assignments GROUP BY document_id"
    )
    op.execute("SET LOCAL enable_hashagg = DEFAULT")
    op.execute("ANALYZE document.document_assignments")
    op.execute("DROP TABLE document.assignments")
    op.execute(f"CREATE VIEW document.assignments AS {EXPAND_ROWS}")


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    # Locking the view locks document_assignments too, in the order readers do.
    op.execute("LOCK TABLE document.assignments IN ACCESS EXCLUSIVE MODE")
    op.execute("SET LOCAL lock_timeout = DEFAULT")
    op.execute("DROP VIEW document.assignments")
    op.execute(
        "CREATE TABLE document.assignments ("
        " document_id UUID NOT NULL, geo_id VARCHAR NOT NULL, zone INTEGER)"
    )
    op.execute(
        f"INSERT INTO document.assignments (document_id, geo_id, zone) {EXPAND_ROWS}"
    )
    op.execute(
        "ALTER TABLE document.assignments "
        "ADD CONSTRAINT assignments_pkey PRIMARY KEY (document_id, geo_id)"
    )
    op.execute("ANALYZE document.assignments")
    op.execute("DROP TABLE document.document_assignments")
