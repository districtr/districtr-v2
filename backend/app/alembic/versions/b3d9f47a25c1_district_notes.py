"""district_notes: split zone notes out of the form-comment tables

Creates comments.district_notes and copies the existing zone-scoped rows
(comments.comment JOIN comments.document_comment WHERE zone IS NOT NULL) into
it, preserving ids — community maps reference note ids from their metadata
JSON (CommunityMetadata.descriptionCommentId), so ids must survive the move.
The source rows are left in place; the whole legacy comment schema is dropped
by a later revision once nothing reads it.

nsfw is backfilled from the legacy moderation semantics: REJECTED, or scored
at/above the 0.2 threshold without an APPROVED override.

Revision ID: b3d9f47a25c1
Revises: e5b7c2f81a93
Create Date: 2026-08-25

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

import app.core.models

# revision identifiers, used by Alembic.
revision: str = "b3d9f47a25c1"
down_revision: Union[str, None] = "e5b7c2f81a93"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "district_notes",
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
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("document_id", app.core.models.UUIDType(), nullable=False),
        sa.Column("zone", sa.Integer(), nullable=False),
        sa.Column("note", sa.String(length=5000), nullable=False),
        sa.Column(
            "nsfw", sa.Boolean(), server_default="false", nullable=False
        ),
        sa.Column("moderation_score", sa.Float(), nullable=True),
        sa.CheckConstraint("zone >= 0", name="zone_non_negative"),
        sa.CheckConstraint("LENGTH(TRIM(note)) > 0", name="note_not_empty"),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["document.document.document_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        schema="comments",
    )
    op.create_index(
        "idx_district_notes_document_zone",
        "district_notes",
        ["document_id", "zone"],
        schema="comments",
    )

    op.execute(
        sa.text(
            """
            INSERT INTO comments.district_notes
                (id, document_id, zone, note, nsfw, moderation_score,
                 created_at, updated_at)
            SELECT
                c.id,
                dc.document_id,
                dc.zone,
                c.comment,
                COALESCE(
                    c.review_status = 'REJECTED'
                    OR (
                        c.moderation_score >= 0.2
                        AND c.review_status IS DISTINCT FROM 'APPROVED'
                    ),
                    false
                ),
                c.moderation_score,
                c.created_at,
                c.updated_at
            FROM comments.comment c
            JOIN comments.document_comment dc ON dc.comment_id = c.id
            WHERE dc.zone IS NOT NULL
            """
        )
    )
    # Explicit-id inserts bypass the sequence; advance it past the copied ids.
    op.execute(
        sa.text(
            """
            SELECT setval(
                pg_get_serial_sequence('comments.district_notes', 'id'),
                COALESCE((SELECT MAX(id) FROM comments.district_notes), 1)
            )
            """
        )
    )


def downgrade() -> None:
    # The source rows were never deleted, so dropping the table restores the
    # pre-migration state minus any edits made after upgrading.
    op.drop_index(
        "idx_district_notes_document_zone", "district_notes", schema="comments"
    )
    op.drop_table("district_notes", schema="comments")
