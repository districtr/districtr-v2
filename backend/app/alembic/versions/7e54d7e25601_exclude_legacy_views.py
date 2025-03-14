"""exclude legacy views

Revision ID: 7e54d7e25601
Revises: 6d83465440a6
Create Date: 2025-03-14 19:10:40.015057

"""

from typing import Sequence, Union
from app.constants import LEGACY_VIEWS
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7e54d7e25601"
down_revision: Union[str, None] = "6d83465440a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # set "visible" to False for all legacy views
    # in table public.districtrmap
    op.execute(
        sa.text(
            f"""
            UPDATE public.districtrmap
            SET visible = False
            WHERE gerrydb_table_name IN ({', '.join([f"'{view}'" for view in LEGACY_VIEWS])})
            """
        )
    )
    pass


def downgrade() -> None:
    # set "visible" to True for all legacy views
    # in table public.districtrmap
    op.execute(
        sa.text(
            f"""
            UPDATE public.districtrmap
            SET visible = True
            WHERE gerrydb_table_name IN ({', '.join([f"'{view}'" for view in LEGACY_VIEWS])})
            """
        )
    )
    pass
