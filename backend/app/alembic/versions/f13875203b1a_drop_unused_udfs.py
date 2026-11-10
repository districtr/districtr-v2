"""drop the last unused UDFs

Nothing calls these any more (ADR 0017's SQLAlchemy-first policy):

- create_shatterable_gerrydb_view: the Python helper of the same name
  (app/utils.py) builds the view with build_shatterable_view.
- get_unassigned_bboxes: replaced by in-process computation (PR #550).
- update_metadata_draft_status: no caller.

Nothing in the schema depends on them (no triggers, views, defaults or
indexes). Dropping a function takes no table locks.

Revision ID: f13875203b1a
Revises: 7684b100ec6c
Create Date: 2026-11-10

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.constants import SQL_DIR

# revision identifiers, used by Alembic.
revision: str = "f13875203b1a"
down_revision: Union[str, None] = "7684b100ec6c"
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
