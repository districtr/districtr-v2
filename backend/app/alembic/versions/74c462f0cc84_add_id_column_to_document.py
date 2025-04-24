"""add id column to document

Revision ID: 74c462f0cc84
Revises: 8b06a98951aa
Create Date: 2025-04-24 12:00:00.000000

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "74c462f0cc84"
down_revision = "8b06a98951aa"
branch_labels = None
depends_on = None


def upgrade():
    # Add id column as SERIAL (auto-incrementing integer)
    op.execute("ALTER TABLE document.document ADD COLUMN serial_id SERIAL")

    # Make the id column the primary key and document_id a regular unique column
    op.execute("ALTER TABLE document.document DROP CONSTRAINT document_pkey")
    op.execute("ALTER TABLE document.document ADD PRIMARY KEY (serial_id)")
    op.execute(
        "ALTER TABLE document.document ADD CONSTRAINT document_id_unique UNIQUE (document_id)"
    )

    # Update the stored procedures to return serial_id as well
    # read the SQL from the file and execute it
    with open("app/sql/versions/74c462f0cc84/create_document_udf.sql", "r") as f:
        op.execute(f.read())


def downgrade():
    # Revert the SQL function to the original version
    with open("app/sql/versions/6d83465440a6/create_document_udf.sql", "r") as f:
        op.execute(f.read())

    # Revert the changes: Make document_id the primary key again
    op.execute("ALTER TABLE document.document DROP CONSTRAINT document_id_unique")
    op.execute("ALTER TABLE document.document DROP CONSTRAINT document_pkey")
    op.execute("ALTER TABLE document.document ADD PRIMARY KEY (document_id)")

    # Drop the id column
    op.execute("ALTER TABLE document.document DROP COLUMN serial_id")
