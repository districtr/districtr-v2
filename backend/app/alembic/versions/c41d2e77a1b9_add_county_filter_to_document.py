"""add county_filter to document

Revision ID: c41d2e77a1b9
Revises: a30db9686b7c
Create Date: 2026-08-04

5-char county FIPS (STATEFP+COUNTYFP) the plan is restricted to; NULL/empty
means no filter. Set once at document creation; stats/evaluation/unassigned
queries filter the geographic universe by it.
"""

from alembic import op

revision = "c41d2e77a1b9"
down_revision = "a30db9686b7c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE document.document ADD COLUMN county_filter VARCHAR[]")


def downgrade() -> None:
    op.execute("ALTER TABLE document.document DROP COLUMN county_filter")
