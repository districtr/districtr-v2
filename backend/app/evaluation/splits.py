""" County splits metrics.

Each public function takes a `DocumentEvaluationContext` and returns a mapping from
county's geoid to the forced and actual splits by the document's districts.
"""

import logging
from typing import Tuple

import sqlalchemy

from app.evaluation.context import (
    COUNTY_CONTEXT,
    DocumentEvaluationContext,
    CountyGeoid,
)

logger = logging.getLogger(__name__)

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

    query_sql = """
        WITH block_assignment AS (
            SELECT * FROM get_block_assignments(:document_id)
        )
        SELECT
            LEFT(geo_id, 5) AS county_geoid,
            array_agg(DISTINCT zone) AS zones
        FROM block_assignment
        WHERE geo_id IS NOT NULL
        GROUP BY county_geoid
    """
    results = context.session.execute(sqlalchemy.text(query_sql), {"document_id": context.document_id})

    forced_split_pieces: dict[CountyGeoid, int] = {}
    actual_split_pieces: dict[CountyGeoid, int] = {}
    county_pops: dict[CountyGeoid, int] = COUNTY_CONTEXT.county_populations(context.gerrydb_table, context.session)
    rows = results.mappings().all()
    logger.info("county_pieces: %d rows from query", len(rows))
    for row in rows:
        county_geoid = row["county_geoid"]
        zones = row["zones"]
        logger.info("county_geoid=%r (type=%s) zones=%r", county_geoid, type(county_geoid).__name__, zones)
        actual_split_pieces[county_geoid] = len(zones)
        forced_split_pieces[county_geoid] = (county_pops.get(county_geoid, 0) + context.ideal_population - 1) // context.ideal_population

    result = {geoid: (forced_split_pieces.get(geoid, 0), actual_split_pieces.get(geoid, 0)) for geoid in county_pops}
    logger.info("county_pieces result keys: %r", list(result.keys()))
    return result