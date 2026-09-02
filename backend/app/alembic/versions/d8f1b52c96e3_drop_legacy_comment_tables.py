"""Convert legacy form comments into submissions, then drop the comment tables

The flexible submissions schema (c7e2a94d81f5) and district_notes
(b3d9f47a25c1) replaced everything these tables did; the backend module that
served them (app/comments) is deleted in the same change. Zone rows were
copied into district_notes by b3d9f47a25c1.

Form comments are real data (dev has live testimony, e.g. the TN workshop),
so before dropping, every legacy form comment becomes a submission:

- PORTAL ATTRIBUTION: gallery membership and moderation authority both key
  on portal_id, so each comment is attributed to its primary tag slug (the
  earliest-created tag == the portal page's slug in the legacy flow); a
  form config row is created per distinct slug. Untagged comments fall back
  to a catch-all 'legacy' config. All created configs get admin_teams='{}'
  (no team information exists here): they are moderatable only by
  review:review-all holders until an admin grants teams in the CMS — and
  they DO accept new public submissions (the portals are real pages), which
  is intended.
- tags follow the new-submission convention: [portal_id, *other slugs].
- map attachments keep their LIVE document reference (legacy behavior);
  map_is_clone=false marks them so takedown never demotes a real user's
  working map (this migration also adds that column).
- moderation preserves the OLD public gate exactly: hidden = anything
  REJECTED (comment, commenter, or a tag) OR anything score-flagged
  (>= 0.2) without an explicit APPROVED override — the old gate excluded
  score-flagged rows from public view entirely, and converting them to
  merely-blurred would retroactively publish testimony no human ever
  approved. nsfw carries the score flag so an admin who un-hides one still
  gets the blur. Reviewers can unhide false positives from the queue.
- submission ids are the legacy comment ids offset past MAX(submissions.id),
  so a deploy where pr10..13 already collected new submissions can't collide.
- negative-zone rows (skipped by b3d9f47a25c1 as never-renderable) are in
  neither district_notes nor submissions and are dropped with the tables —
  a deliberate one-way loss.

Downgrade recreates the tables (final shape as of 0db008690d60 + da39a3ee5e6b)
empty — it does NOT reverse the conversion (converted rows simply remain in
comments.submissions); restore from a backup if the original rows are needed.

Revision ID: d8f1b52c96e3
Revises: c7e2a94d81f5
Create Date: 2026-08-25

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import app.core.models
from app.constants import SQL_DIR

# revision identifiers, used by Alembic.
revision: str = "d8f1b52c96e3"
down_revision: Union[str, None] = "c7e2a94d81f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Inlined (the app-side ReviewStatus enum was deleted with the legacy
# comment tables; this migration must stay runnable). create_type=False so
# create_table doesn't re-emit CREATE TYPE; downgrade creates it explicitly.
review_status_enum = postgresql.ENUM(
    "REVIEWED",
    "APPROVED",
    "REJECTED",
    name="review_status_enum",
    schema="comments",
    create_type=False,
)


def _timestamps():
    return (
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
    )


# Form comments = every comment that is not a zone note. document_comment's
# PK is comment_id, so the LEFT JOIN cannot fan out.
_FORM_COMMENT_FILTER = """
    LEFT JOIN comments.document_comment dc ON dc.comment_id = c.id
    WHERE dc.zone IS NULL
"""

# The full field registry (backend/app/submissions/fields.py) so the catch-all
# config passes the required_fields <@ fields CHECK under any later edit.
_ALL_FIELDS = (
    "ARRAY['salutation','first_name','last_name','email','title',"
    "'comment','place','state','zip_code']::varchar(64)[]"
)


def _convert_legacy_form_comments(bind) -> None:
    # One config per portal the legacy data references: the comment's primary
    # (earliest) tag slug IS the portal page slug in the legacy flow, and
    # gallery membership + moderation authority both key on portal_id — a
    # catch-all portal would empty every legacy tag gallery. Untagged
    # comments fall back to 'legacy'.
    bind.execute(
        sa.text(
            f"""
            INSERT INTO comments.form_configs
                (portal_id, name, fields, required_fields,
                 require_email_confirm, admin_teams)
            SELECT DISTINCT
                   COALESCE(t.primary_slug, 'legacy'),
                   COALESCE(t.primary_slug, 'Legacy submissions'),
                   {_ALL_FIELDS}, '{{}}'::varchar(64)[], false,
                   '{{}}'::varchar(255)[]
            FROM comments.comment c
            LEFT JOIN LATERAL (
                SELECT (array_agg(tg.slug ORDER BY tg.id))[1] AS primary_slug
                FROM comments.comment_tag ct
                JOIN comments.tag tg ON tg.id = ct.tag_id
                WHERE ct.comment_id = c.id
            ) t ON true
            {_FORM_COMMENT_FILTER}
            ON CONFLICT (portal_id) DO NOTHING
            """
        )
    )

    offset = bind.execute(
        sa.text("SELECT COALESCE(MAX(id), 0) FROM comments.submissions")
    ).scalar()

    bind.execute(
        sa.text(
            """
            WITH enriched AS (
                SELECT
                    c.id, c.created_at, c.updated_at, c.review_flagged,
                    d.public_id,
                    c.review_status::text AS c_status,
                    c.moderation_score AS c_score,
                    cm.review_status::text AS m_status,
                    cm.moderation_score AS m_score,
                    t.slugs, t.rejected_tag, t.score_flagged_tag, t.max_tag_score,
                    COALESCE((t.slugs)[1], 'legacy') AS portal
                FROM comments.comment c
                LEFT JOIN comments.document_comment dc ON dc.comment_id = c.id
                LEFT JOIN comments.commenter cm ON cm.id = c.commenter_id
                LEFT JOIN LATERAL (
                    SELECT
                        array_agg(tg.slug ORDER BY tg.id)::varchar(255)[] AS slugs,
                        bool_or(tg.review_status::text = 'REJECTED') AS rejected_tag,
                        bool_or(
                            tg.moderation_score >= 0.2
                            AND tg.review_status::text IS DISTINCT FROM 'APPROVED'
                        ) AS score_flagged_tag,
                        max(tg.moderation_score) AS max_tag_score
                    FROM comments.comment_tag ct
                    JOIN comments.tag tg ON tg.id = ct.tag_id
                    WHERE ct.comment_id = c.id
                ) t ON true
                LEFT JOIN document.document d ON d.document_id = dc.document_id
                WHERE dc.zone IS NULL
            ),
            score_flags AS (
                SELECT e.*,
                    COALESCE(
                        (e.c_score >= 0.2 AND e.c_status IS DISTINCT FROM 'APPROVED')
                        OR (e.m_score >= 0.2 AND e.m_status IS DISTINCT FROM 'APPROVED')
                        OR e.score_flagged_tag,
                        false
                    ) AS score_flagged,
                    COALESCE(
                        e.c_status = 'REJECTED'
                        OR e.m_status = 'REJECTED'
                        OR e.rejected_tag,
                        false
                    ) AS was_rejected
                FROM enriched e
            )
            INSERT INTO comments.submissions
                (id, portal_id, map_public_id, tags, status, submitted_at,
                 nsfw, hidden, flagged, moderation_score, map_is_clone,
                 created_at, updated_at)
            SELECT
                e.id + :offset,
                e.portal,
                e.public_id,
                ARRAY[e.portal]::varchar(255)[]
                    || array_remove(COALESCE(e.slugs, '{}'), e.portal),
                'submitted',
                e.created_at,
                e.score_flagged,
                -- The OLD public gate fully excluded score-flagged rows that
                -- no human APPROVED; blurred-but-fetchable would widen their
                -- exposure retroactively, so they convert as hidden too.
                e.was_rejected OR e.score_flagged,
                e.review_flagged,
                GREATEST(e.c_score, e.m_score, e.max_tag_score),
                false,
                e.created_at,
                e.updated_at
            FROM score_flags e
            """
        ),
        {"offset": offset},
    )

    bind.execute(
        sa.text(
            f"""
            INSERT INTO comments.submissions_content (submission_id, field, value)
            SELECT c.id + :offset, f.field, LEFT(BTRIM(f.value), 5000)
            FROM comments.comment c
            LEFT JOIN comments.commenter cm ON cm.id = c.commenter_id
            CROSS JOIN LATERAL (VALUES
                ('title', c.title),
                ('comment', c.comment),
                ('salutation', cm.salutation),
                ('first_name', cm.first_name),
                ('last_name', cm.last_name),
                ('email', cm.email),
                ('place', cm.place),
                ('state', cm.state),
                ('zip_code', cm.zip_code)
            ) AS f(field, value)
            {_FORM_COMMENT_FILTER}
              AND f.value IS NOT NULL AND LENGTH(TRIM(f.value)) > 0
            """
        ),
        {"offset": offset},
    )

    # Explicit-id inserts bypass the sequence; advance it past the copied ids.
    bind.execute(
        sa.text(
            """
            SELECT setval(
                pg_get_serial_sequence('comments.submissions', 'id'),
                (SELECT COALESCE(MAX(id), 1) FROM comments.submissions)
            )
            """
        )
    )


def upgrade() -> None:
    # Whether the submission's map is a submission-owned frozen clone (new
    # prompt/form submissions) or a live reference to the author's working
    # document (drafts, converted legacy rows, later auto-collect modes).
    # Takedown may only demote the draft_status of CLONES.
    op.add_column(
        "submissions",
        sa.Column(
            "map_is_clone",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        schema="comments",
    )
    # Every pre-existing submitted row was created by clone-at-submission.
    op.execute(
        sa.text(
            "UPDATE comments.submissions SET map_is_clone = true "
            "WHERE status = 'submitted'"
        )
    )
    _convert_legacy_form_comments(op.get_bind())
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
    op.drop_column("submissions", "map_is_clone", schema="comments")
    # Recreates the schema only; rows are unrecoverable without a backup.
    op.execute(
        sa.text(
            "CREATE TYPE comments.review_status_enum AS ENUM "
            "('REVIEWED', 'APPROVED', 'REJECTED')"
        )
    )

    op.create_table(
        "commenter",
        *_timestamps(),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("first_name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("salutation", sa.String(length=255), nullable=True),
        sa.Column("last_name", sa.String(length=255), nullable=True),
        sa.Column("place", sa.String(length=255), nullable=True),
        sa.Column("state", sa.String(length=255), nullable=True),
        sa.Column("zip_code", sa.String(length=255), nullable=True),
        sa.Column("moderation_score", sa.Float(), nullable=True),
        sa.Column("review_status", review_status_enum, nullable=True),
        sa.CheckConstraint(
            "email ~* '^[a-zA-Z0-9.!#$%%&''*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$'",
            name="valid_email_format",
        ),
        sa.CheckConstraint("LENGTH(TRIM(email)) > 0", name="email_not_empty"),
        sa.CheckConstraint("LENGTH(TRIM(first_name)) > 0", name="first_name_not_empty"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "first_name", "email", name="commenter_unique_on_first_name_and_email"
        ),
        schema="comments",
    )
    op.create_index(
        "idx_commenter_first_name_and_email",
        "commenter",
        [sa.text("lower(trim(first_name))"), sa.text("lower(trim(email))")],
        unique=False,
        schema="comments",
    )
    op.create_index(
        op.f("ix_comments_commenter_id"),
        "commenter",
        ["id"],
        unique=True,
        schema="comments",
    )

    op.create_table(
        "comment",
        *_timestamps(),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("comment", sa.String(length=5000), nullable=False),
        sa.Column("commenter_id", sa.Integer(), nullable=True),
        sa.Column("moderation_score", sa.Float(), nullable=True),
        sa.Column("review_status", review_status_enum, nullable=True),
        sa.Column(
            "review_flagged", sa.Boolean(), nullable=False, server_default="false"
        ),
        sa.ForeignKeyConstraint(["commenter_id"], ["comments.commenter.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("LENGTH(TRIM(title)) > 0", name="title_not_empty"),
        sa.CheckConstraint("LENGTH(TRIM(comment)) > 0", name="comment_not_empty"),
        schema="comments",
    )
    op.create_index(
        op.f("ix_comments_comment_commenter_id"),
        "comment",
        ["commenter_id"],
        unique=False,
        schema="comments",
    )
    op.create_index(
        op.f("ix_comments_comment_id"),
        "comment",
        ["id"],
        unique=True,
        schema="comments",
    )

    op.create_table(
        "tag",
        *_timestamps(),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=False),
        sa.Column("moderation_score", sa.Float(), nullable=True),
        sa.Column("review_status", review_status_enum, nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("LENGTH(slug) > 0", name="slug_not_empty"),
        schema="comments",
    )
    op.create_index(
        op.f("ix_comments_tag_id"), "tag", ["id"], unique=True, schema="comments"
    )
    op.create_index(
        op.f("ix_comments_tag_slug"), "tag", ["slug"], unique=True, schema="comments"
    )

    op.create_table(
        "comment_tag",
        sa.Column("comment_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["comment_id"], ["comments.comment.id"]),
        sa.ForeignKeyConstraint(["tag_id"], ["comments.tag.id"]),
        sa.PrimaryKeyConstraint("comment_id", "tag_id"),
        sa.UniqueConstraint("comment_id", "tag_id", name="unique_comment_tag_link"),
        schema="comments",
    )

    op.create_table(
        "document_comment",
        sa.Column("comment_id", sa.Integer(), nullable=False),
        sa.Column("document_id", app.core.models.UUIDType(), nullable=False),
        sa.Column("zone", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["comment_id"], ["comments.comment.id"]),
        sa.ForeignKeyConstraint(["document_id"], ["document.document.document_id"]),
        sa.PrimaryKeyConstraint("comment_id"),
        sa.UniqueConstraint("comment_id"),
        schema="comments",
    )
    op.create_index(
        op.f("ix_comments_document_comment_document_id"),
        "document_comment",
        ["document_id"],
        unique=False,
        schema="comments",
    )

    with open(SQL_DIR / "normalize_email.sql", "r") as f:
        op.execute(sa.text(f.read()))
    op.execute(
        sa.text("""
        CREATE TRIGGER normalize_email_trigger
            BEFORE INSERT OR UPDATE ON comments.commenter
            FOR EACH ROW EXECUTE FUNCTION normalize_email();
    """)
    )
    with open(SQL_DIR / "slugify_tag.sql", "r") as f:
        op.execute(sa.text(f.read()))
