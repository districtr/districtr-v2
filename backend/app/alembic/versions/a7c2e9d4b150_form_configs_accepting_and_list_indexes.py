"""form_configs.accepting; indexes for the public submissions list

accepting mirrors whether the portal page is published. The CMS keeps it in
sync on publish, unpublish and delete; the backend refuses public intake and
public listing for closed portals. The backfill reads the CMS page tree when
the admin schema is present, so configs whose page is a draft or gone start
closed. Without the admin schema (a fresh backend-only database) every
existing row stays open.

The two partial indexes serve /api/submissions, which orders visible rows by
submitted_at DESC, id DESC (submitted rows always carry submitted_at, per the
submitted_iff_timestamp check). ix_comments_form_configs_portal_id is dropped:
it duplicated the unique constraint's index, and the model now declares only
the constraint.

Revision ID: a7c2e9d4b150
Revises: f3a9c1d27e58
Create Date: 2026-09-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a7c2e9d4b150"
down_revision: Union[str, None] = "f3a9c1d27e58"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

VISIBLE = sa.text("status = 'submitted' AND NOT hidden")


def upgrade() -> None:
    op.drop_index(
        "ix_comments_form_configs_portal_id",
        table_name="form_configs",
        schema="comments",
    )
    op.add_column(
        "form_configs",
        sa.Column("accepting", sa.Boolean(), nullable=False, server_default=sa.true()),
        schema="comments",
    )
    # A config is open when any translation of its default-locale portal
    # page is live. 'tagpage' covers a CMS that hasn't run content/0006 yet.
    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('admin.wagtailcore_page') IS NOT NULL THEN
                UPDATE comments.form_configs AS fc
                SET accepting = EXISTS (
                    SELECT 1
                    FROM admin.wagtailcore_page AS d
                    JOIN admin.wagtailcore_locale AS l ON l.id = d.locale_id
                    JOIN admin.django_content_type AS ct
                        ON ct.id = d.content_type_id
                    JOIN admin.wagtailcore_page AS t
                        ON t.translation_key = d.translation_key
                    WHERE d.slug = fc.portal_id
                      AND l.language_code = 'en'
                      AND ct.app_label = 'content'
                      AND ct.model IN ('portalpage', 'tagpage')
                      AND t.live
                );
            END IF;
        END
        $$;
        """
    )
    op.create_index(
        "idx_submissions_visible_submitted",
        "submissions",
        [sa.text("submitted_at DESC"), sa.text("id DESC")],
        schema="comments",
        postgresql_where=VISIBLE,
    )
    op.create_index(
        "idx_submissions_visible_portal_submitted",
        "submissions",
        ["portal_id", sa.text("submitted_at DESC"), sa.text("id DESC")],
        schema="comments",
        postgresql_where=VISIBLE,
    )


def downgrade() -> None:
    op.drop_index(
        "idx_submissions_visible_portal_submitted",
        table_name="submissions",
        schema="comments",
    )
    op.drop_index(
        "idx_submissions_visible_submitted",
        table_name="submissions",
        schema="comments",
    )
    op.drop_column("form_configs", "accepting", schema="comments")
    op.create_index(
        "ix_comments_form_configs_portal_id",
        "form_configs",
        ["portal_id"],
        schema="comments",
    )
