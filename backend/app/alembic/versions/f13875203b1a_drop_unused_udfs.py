"""drop unused UDFs

Neither the current nor the previous release calls these (ADR 0017's
SQLAlchemy-first policy), so dropping them is safe while old tasks are still
serving during a rolling deploy:

- create_shatterable_gerrydb_view: the Python helper of the same name
  (app/utils.py) builds the view with build_shatterable_view.
- get_unassigned_bboxes: replaced by in-process computation (PR #550).
- update_metadata_draft_status: no caller.

get_zone_assignments_geo is not dropped here: the previous release's district
rebuild still calls it, so it goes in a later release.

Nothing in the schema depends on these (no triggers, views, defaults or
indexes). Dropping a function takes no table locks.

Revision ID: f13875203b1a
Revises: 55d7b369ed57
Create Date: 2026-11-10

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.constants import SQL_DIR

# revision identifiers, used by Alembic.
revision: str = "f13875203b1a"
down_revision: Union[str, None] = "55d7b369ed57"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "DROP PROCEDURE IF EXISTS create_shatterable_gerrydb_view(text, text, text)"
        )
    )
    op.execute(
        sa.text(
            "DROP FUNCTION IF EXISTS get_unassigned_bboxes(uuid, character varying[])"
        )
    )
    op.execute(sa.text("DROP FUNCTION IF EXISTS update_metadata_draft_status(jsonb)"))


def downgrade() -> None:
    # Recreates each from the file its last migration loaded; the files stay
    # in app/alembic/sql because older revisions replay them.
    for file in (
        "create_shatterable_gerrydb_view.sql",
        "get_unassigned_bboxes_udf_rev2.sql",
        "update_metadata_draft_status.sql",
    ):
        with open(f"{SQL_DIR}/{file}") as f:
            op.execute(sa.text(f.read()))
