"""save and share

Revision ID: 518ab28c5fd6
Revises: fa7d5c356d1f
Create Date: 2025-03-18 23:13:45.141744

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
import app.models

# revision identifiers, used by Alembic.
revision: str = "518ab28c5fd6"
down_revision: Union[str, None] = "fa7d5c356d1f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "map_document_token",
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
        sa.Column("token_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("document_id", app.models.UUIDType(), nullable=True),
        sa.Column("password_hash", sa.String(), nullable=True),
        sa.Column("expiration_date", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("token_id"),
        sa.UniqueConstraint("document_id", name="unique_document"),
        schema="document",
    )
    op.create_table(
        "map_document_user_session",
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
        sa.Column("session_id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("document_id", app.models.UUIDType(), nullable=False),
        sa.PrimaryKeyConstraint("session_id"),
        schema="document",
    )

    # add metadata json column to the document table
    op.add_column(
        "document",
        sa.Column("map_metadata", sa.JSON(), nullable=True),
        schema="document",
    )


def downgrade() -> None:
    op.drop_table("map_document_user_session", schema="document")
    op.drop_table("map_document_token", schema="document")
    op.drop_column("document", "map_metadata", schema="document")
