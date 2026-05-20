""" County splits metrics.

Each public function takes a `DocumentEvaluationContext` and returns a mapping from
county's geoid to the forced and actual splits by the document's districts.
"""

from typing import Tuple

import sqlmodel

from app.evaluation.context import (
    COUNTY_CONTEXT,
    DocumentEvaluationContext,
    CountyGeoid,
)
from app.models import Assignments


def county_pieces(context: DocumentEvaluationContext) -> dict[CountyGeoid, Tuple[int, int]]:
    """Returns a mapping from county geoid to a tuple of
    (forced_split_pieces, actual_split_pieces).

    A "split" occurs when a county is divided across multiple districts.  The "forced"
    split pieces are the minimum number of pieces required to accommodate the population
    of the county, given the ideal district population.  The "actual" split pieces are
    the number of split pieces in the submitted plan. For unfinished districting plans,
    the actual split pieces does not treat the unassigned area as a zone, and completely
    unassigned counties will thus have a piece-count of 0.

    The number of counties split into two or more pieces can be easily derived from this
    mapping by counting the number of counties where `actual_split_pieces` is 2 or more.
    """
    county_pops: dict[CountyGeoid, int] = COUNTY_CONTEXT.county_populations(context.gerrydb_table, context.session)
    rows = context.session.exec(
        sqlmodel.select(Assignments.geo_id, Assignments.zone)
        .where(Assignments.document_id == context.document_id)
        .where(Assignments.zone.isnot(None))  # type: ignore[union-attr]
    ).all()

    county_zones: dict[CountyGeoid, set[int]] = {}
    for geo_id, zone in rows:
        bare_id = geo_id.split(":", 1)[1] if ":" in geo_id else geo_id
        geoid = CountyGeoid(bare_id[:5])
        county_zones.setdefault(geoid, set()).add(zone)

    return {
        geoid: (
            (pop + context.ideal_population - 1) // context.ideal_population,
            len(county_zones.get(geoid, set())),
        )
        for geoid, pop in county_pops.items()
    }
