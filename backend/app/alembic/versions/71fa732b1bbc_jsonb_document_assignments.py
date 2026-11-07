"""store each document's assignments as one jsonb row

Moves district assignments from one `document.assignments` row per unit to one
`document.document_assignments` row per document holding `{geo_id: zone}`
(about 30x smaller on disk). `document.assignments` becomes a read-only view
that expands the jsonb, so every reader (district_unions rebuild, contiguity,
thumbnails, exports, evaluation, get_assignments) is unchanged; only writers
target the new table. Rationale and benchmarks: docs/adr/0068.

community_assignments is untouched (a geo_id can belong to several
communities, so it doesn't fit a {geo_id: zone} object).

Locking: writes to document.assignments are blocked (EXCLUSIVE; reads continue)
for the copy, then DROP takes ACCESS EXCLUSIVE briefly. The copy streams in
document order, so its time scales with the table's row count (local: 645k
rows in a few seconds). Saves from API tasks still on the old code fail
between this migration and the new tasks' rollout; clients keep the edits in
IndexedDB and the next autosave retries.

Downgrade rebuilds the plain table with the same rows. Documents saved with
an empty plan keep no rows either way.

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

# One row per (document, unit), as the old table had. `#>> '{}'` turns a jsonb
# number or null into text/NULL before the cast.
EXPAND_ROWS = """
    SELECT a.document_id, e.key AS geo_id, (e.value #>> '{}')::integer AS zone
    FROM document.document_assignments a
    CROSS JOIN LATERAL jsonb_each(a.assignments) AS e
"""


def upgrade() -> None:
    op.execute("LOCK TABLE document.assignments IN EXCLUSIVE MODE")
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
    op.execute("ANALYZE document.document_assignments")
    op.execute("DROP TABLE document.assignments")
    op.execute(f"CREATE VIEW document.assignments AS {EXPAND_ROWS}")


def downgrade() -> None:
    op.execute("LOCK TABLE document.document_assignments IN EXCLUSIVE MODE")
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
