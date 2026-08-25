"""Drop the legacy comment tables

The flexible submissions schema (c7e2a94d81f5) and district_notes
(b3d9f47a25c1) replaced everything these tables did; the backend module that
served them (app/comments) is deleted in the same change. Zone rows were
copied into district_notes by b3d9f47a25c1; form comments/commenters/tags are
dropped without migration by decision.

Irreversible: downgrade raises. Restore from a backup if this ever needs
undoing.

Revision ID: d8f1b52c96e3
Revises: c7e2a94d81f5
Create Date: 2026-08-25

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "d8f1b52c96e3"
down_revision: Union[str, None] = "c7e2a94d81f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("document_comment", schema="comments")
    op.drop_table("comment_tag", schema="comments")
    op.drop_table("comment", schema="comments")
    op.drop_table("tag", schema="comments")
    op.drop_table("commenter", schema="comments")
    op.execute(sa.text("DROP TYPE IF EXISTS comments.review_status_enum"))
    op.execute(sa.text("DROP FUNCTION IF EXISTS slugify_tag(TEXT)"))
    # normalize_email's trigger went down with the commenter table.
    op.execute(sa.text("DROP FUNCTION IF EXISTS normalize_email()"))


def downgrade() -> None:
    raise NotImplementedError(
        "The legacy comment tables are gone for good — restore from a backup."
    )
