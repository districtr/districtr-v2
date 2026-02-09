"""document comments standalone table

Create a standalone document_comment table in the document schema,
migrate existing zone comments from comments schema, and remove
the zone column from comments.document_comment.

Revision ID: a1b2c3d4e5f6
Revises: 5600a4bfe3c4
Create Date: 2026-02-09 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import app.core.models


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "111fa461521c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create the new document_comment table in the document schema
    op.create_table(
        "document_comment",
        sa.Column(
            "comment_id",
            app.core.models.UUIDType(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "document_id",
            app.core.models.UUIDType(),
            nullable=False,
        ),
        sa.Column("zone", sa.Integer(), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
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
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["document.document.document_id"],
        ),
        sa.PrimaryKeyConstraint("comment_id"),
        schema="document",
    )
    op.create_index(
        "ix_document_document_comment_document_id",
        "document_comment",
        ["document_id"],
        unique=False,
        schema="document",
    )
    op.create_index(
        "ix_document_document_comment_zone",
        "document_comment",
        ["zone"],
        unique=False,
        schema="document",
    )

    # Migrate existing zone comments from comments schema to new table
    op.execute(
        """
        INSERT INTO document.document_comment (document_id, zone, text, created_at, updated_at)
        SELECT
            dc.document_id,
            dc.zone,
            c.comment,
            c.created_at,
            c.updated_at
        FROM comments.document_comment dc
        JOIN comments.comment c ON c.id = dc.comment_id
        WHERE dc.zone IS NOT NULL
        """
    )

    # Remove the zone column from the comments schema document_comment table
    op.drop_index(
        "ix_comments_document_comment_document_id",
        table_name="document_comment",
        schema="comments",
    )
    op.drop_column("document_comment", "zone", schema="comments")
    op.create_index(
        "ix_comments_document_comment_document_id",
        "document_comment",
        ["document_id"],
        unique=False,
        schema="comments",
    )


def downgrade() -> None:
    # Re-add zone column to comments.document_comment
    op.drop_index(
        "ix_comments_document_comment_document_id",
        table_name="document_comment",
        schema="comments",
    )
    op.add_column(
        "document_comment",
        sa.Column("zone", sa.Integer(), nullable=True),
        schema="comments",
    )
    op.create_index(
        "ix_comments_document_comment_document_id",
        "document_comment",
        ["document_id"],
        unique=False,
        schema="comments",
    )

    # Drop the new table
    op.drop_index(
        "ix_document_document_comment_zone",
        table_name="document_comment",
        schema="document",
    )
    op.drop_index(
        "ix_document_document_comment_document_id",
        table_name="document_comment",
        schema="document",
    )
    op.drop_table("document_comment", schema="document")
