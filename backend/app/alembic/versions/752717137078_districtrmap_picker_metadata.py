"""districtrmap picker metadata: description, state, boundary type

Adds four nullable descriptive columns used by the CMS module picker, then
backfills what can be inferred: state from single-state ``statefps`` and
boundary type from the ``{st}_{boundary}_districts`` slug convention. Rows
that don't match stay NULL for editors to fill in. districtrmap is a small
table (hundreds of rows); ADD COLUMN NULL is metadata-only.

Revision ID: 752717137078
Revises: a7c2e9d4b150
Create Date: 2026-09-29 19:26:56.545007

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "752717137078"
down_revision: Union[str, None] = "a7c2e9d4b150"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS = ("description", "state_abbr", "state_name", "boundary_type")

STATES = {
    "01": ("AL", "Alabama"),
    "02": ("AK", "Alaska"),
    "04": ("AZ", "Arizona"),
    "05": ("AR", "Arkansas"),
    "06": ("CA", "California"),
    "08": ("CO", "Colorado"),
    "09": ("CT", "Connecticut"),
    "10": ("DE", "Delaware"),
    "11": ("DC", "District of Columbia"),
    "12": ("FL", "Florida"),
    "13": ("GA", "Georgia"),
    "15": ("HI", "Hawaii"),
    "16": ("ID", "Idaho"),
    "17": ("IL", "Illinois"),
    "18": ("IN", "Indiana"),
    "19": ("IA", "Iowa"),
    "20": ("KS", "Kansas"),
    "21": ("KY", "Kentucky"),
    "22": ("LA", "Louisiana"),
    "23": ("ME", "Maine"),
    "24": ("MD", "Maryland"),
    "25": ("MA", "Massachusetts"),
    "26": ("MI", "Michigan"),
    "27": ("MN", "Minnesota"),
    "28": ("MS", "Mississippi"),
    "29": ("MO", "Missouri"),
    "30": ("MT", "Montana"),
    "31": ("NE", "Nebraska"),
    "32": ("NV", "Nevada"),
    "33": ("NH", "New Hampshire"),
    "34": ("NJ", "New Jersey"),
    "35": ("NM", "New Mexico"),
    "36": ("NY", "New York"),
    "37": ("NC", "North Carolina"),
    "38": ("ND", "North Dakota"),
    "39": ("OH", "Ohio"),
    "40": ("OK", "Oklahoma"),
    "41": ("OR", "Oregon"),
    "42": ("PA", "Pennsylvania"),
    "44": ("RI", "Rhode Island"),
    "45": ("SC", "South Carolina"),
    "46": ("SD", "South Dakota"),
    "47": ("TN", "Tennessee"),
    "48": ("TX", "Texas"),
    "49": ("UT", "Utah"),
    "50": ("VT", "Vermont"),
    "51": ("VA", "Virginia"),
    "53": ("WA", "Washington"),
    "54": ("WV", "West Virginia"),
    "55": ("WI", "Wisconsin"),
    "56": ("WY", "Wyoming"),
    "72": ("PR", "Puerto Rico"),
}

# (slug fragment, name word, boundary type); first match wins.
BOUNDARIES = (
    ("congressional", "congressional", "Congressional"),
    ("state_house", "house", "State House"),
    ("state_senate", "senate", "State Senate"),
    ("custom", None, "Custom"),
)


def upgrade() -> None:
    for column in COLUMNS:
        op.add_column("districtrmap", sa.Column(column, sa.String(), nullable=True))

    update_state = sa.text(
        "UPDATE districtrmap SET state_abbr = :abbr, state_name = :name "
        "WHERE statefps = ARRAY[:fips]::varchar[]"
    )
    for fips, (abbr, name) in STATES.items():
        op.execute(update_state.bindparams(fips=fips, abbr=abbr, name=name))

    update_boundary = sa.text(
        "UPDATE districtrmap SET boundary_type = :label "
        "WHERE boundary_type IS NULL "
        "AND (districtr_map_slug LIKE :slug_pattern OR name ILIKE :name_pattern)"
    )
    for fragment, word, label in BOUNDARIES:
        op.execute(
            update_boundary.bindparams(
                label=label,
                slug_pattern=f"%\\_{fragment}\\_%",
                # NULL never matches ILIKE: slug-only for "custom".
                name_pattern=f"%{word}%" if word else None,
            )
        )


def downgrade() -> None:
    for column in reversed(COLUMNS):
        op.drop_column("districtrmap", column)
