"""mvt support

Revision ID: 37df7623849e
Revises: 0f8bbbcdd7be
Create Date: 2025-01-20 21:15:55.778697

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# from sqlalchemy.exc import ProgrammingError
from app.main import settings  # , get_session


# revision identifiers, used by Alembic.
revision: str = "37df7623849e"
down_revision: Union[str, None] = "0f8bbbcdd7be"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with open(settings.SQL_DIR / "create_assignment_geo_view.sql") as f:
        op.execute(sa.text(f.read()))

    with open(settings.SQL_DIR / "zone_assignments_geo.sql") as f:
        op.execute(sa.text(f.read()))

    # session = next(get_session())
    # result = (
    #     session.execute(sa.text("SELECT document_id from document.document"))
    #     .scalars()
    #     .all()
    # )

    # for document_id in result:
    #     try:
    #         session = next(get_session())
    #         session.execute(
    #             sa.text("CALL create_zone_assignments_geo_view(:document_id)"),
    #             {"document_id": str(document_id)},
    #         )
    #         print(f"Created zone assignments for document {document_id}")
    #     except ProgrammingError:
    #         print(f"Failed to create zone assignments for document {document_id}")


def downgrade() -> None:
    op.execute(
        sa.text("DROP PROCEDURE IF EXISTS create_zone_assignments_geo_view(UUID)")
    )
    op.execute(sa.text("DROP FUNCTION IF EXISTS zone_assignments_geo(UUID)"))
