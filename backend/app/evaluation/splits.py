""" County splits metrics.

Each public function takes a `DocumentEvaluationContext` and returns a mapping from
county's geoid to the forced and actual splits by the document's districts.
"""

from typing import Tuple

from app.evaluation.context import (
    COUNTY_CONTEXT,
    DocumentEvaluationContext,
    CountyGeoid,
)
from app.evaluation.types import CountyPiecesInfo, DistrictId


def _geo_id_to_county_geoid(geo_id: str) -> CountyGeoid:
    bare = geo_id.split(":", 1)[1] if ":" in geo_id else geo_id
    return CountyGeoid(bare[:5])


def county_pieces(context: DocumentEvaluationContext) -> dict[CountyGeoid, CountyPiecesInfo]:
    """Returns a mapping from county geoid to a tuple of
    (population, actual_split_pieces, county_name).

    A "split" occurs when a county is divided across multiple districts. The "actual"
    split pieces are the number of pieces in the submitted plan. For unfinished districting
    plans, the actual split pieces does not treat the unassigned area as a zone, and
    completely unassigned counties will thus have a piece-count of 0.

    The number of counties split into two or more pieces can be easily derived from this
    mapping by counting the number of counties where `actual_split_pieces` is 2 or more.
    """
    county_pops: dict[CountyGeoid, int] = COUNTY_CONTEXT.county_populations(context.parent_layer, context.session)

    county_zones: dict[CountyGeoid, set[int]] = {}
    for geo_id, zone in context.zone_assignments:
        county_zones.setdefault(_geo_id_to_county_geoid(geo_id), set()).add(zone)

    return {
        county_geoid: CountyPiecesInfo(
            total_pop=pop,
            pieces=len(county_zones.get(county_geoid, set())),
            name=COUNTY_CONTEXT.county_name(county_geoid),
        )
        for county_geoid, pop in county_pops.items()
    }


def district_county_membership(context: DocumentEvaluationContext) -> dict[DistrictId, list[CountyGeoid]]:
    """Returns a mapping from district (zone) to the sorted list of county geoids
    that overlap with that district.
    """
    zone_counties: dict[DistrictId, set[CountyGeoid]] = {}
    for geo_id, zone in context.zone_assignments:
        zone_counties.setdefault(DistrictId(zone), set()).add(_geo_id_to_county_geoid(geo_id))

    return {zone: sorted(counties) for zone, counties in zone_counties.items()}
