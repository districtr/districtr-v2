"""dedupe map_document_token and restore unique(document_id)

`unique_document` was created in 518ab28c5fd6 and dropped by 239ca64ca70d
(the model never declared it, so autogenerate removed it). Without it, the
share endpoint's check-then-insert raced and gave some documents two or more
token rows, which 500'd `get_districtr_map`.

Keeps one row per document_id: a row with a password_hash first, then the
oldest created_at. token_id is never read after creation (share links use
public_id), so deleting the extras breaks no links.

Locking: SHARE ROW EXCLUSIVE for the delete (reads continue, share requests
wait), then ACCESS EXCLUSIVE while the unique index builds. The table holds
one row per shared plan, small enough for this to take well under a second.

Downgrade drops the constraint only; deleted duplicate rows are not restored.

Revision ID: 1f0fe1359926
Revises: 55d7b369ed57
Create Date: 2026-11-12

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1f0fe1359926"
down_revision: Union[str, None] = "55d7b369ed57"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Block concurrent share inserts so no new duplicate lands between the
    # delete and the constraint build.
    op.execute("LOCK TABLE document.map_document_token IN SHARE ROW EXCLUSIVE MODE")
    op.execute(
        """
        DELETE FROM document.map_document_token t
        USING (
            SELECT
                token_id,
                row_number() OVER (
                    PARTITION BY document_id
                    ORDER BY (password_hash IS NULL), created_at, token_id
                ) AS rn
            FROM document.map_document_token
            WHERE document_id IS NOT NULL
        ) ranked
        WHERE t.token_id = ranked.token_id AND ranked.rn > 1
        """
    )
    op.create_unique_constraint(
        "unique_document",
        "map_document_token",
        ["document_id"],
        schema="document",
    )


def downgrade() -> None:
    # Duplicate rows deleted by upgrade() are not restored.
    op.drop_constraint(
        "unique_document", "map_document_token", schema="document", type_="unique"
    )
