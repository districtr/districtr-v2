"""County splits metrics.

Each public function takes a `DocumentEvaluationContext` and returns a mapping from
county's geoid to the forced and actual splits by the document's districts.
"""

from app.evaluation.context import (
    COUNTY_CONTEXT,
    DocumentEvaluationContext,
    CountyGeoid,
)
from app.evaluation.graph_loader import get_graph
from app.evaluation.types import CountyPartsInfo, CountyPiecesInfo, DistrictId


def _geo_id_to_county_geoid(geo_id: str) -> CountyGeoid:
    bare = geo_id.split(":", 1)[1] if ":" in geo_id else geo_id
    return CountyGeoid(bare[:5])


def county_pieces(
    context: DocumentEvaluationContext,
) -> dict[CountyGeoid, CountyPiecesInfo]:
    """Returns a mapping from county geoid to a tuple of
    (population, actual_split_pieces, county_name).

    A "split" occurs when a county is divided across multiple districts. The "actual"
    split pieces are the number of pieces in the submitted plan. For unfinished districting
    plans, the actual split pieces does not treat the unassigned area as a zone, and
    completely unassigned counties will thus have a piece-count of 0.

    The number of counties split into two or more pieces can be easily derived from this
    mapping by counting the number of counties where `actual_split_pieces` is 2 or more.
    """
    county_pops: dict[CountyGeoid, int] = COUNTY_CONTEXT.county_populations(
        context.parent_layer, context.session
    )

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


def county_parts(
    context: DocumentEvaluationContext,
) -> dict[CountyGeoid, CountyPartsInfo]:
    """Returns a mapping from county geoid to a tuple of
    (population, actual_split_parts, county_name, component_populations).

    A "split" occurs when a county is divided across multiple districts. The "actual"
    split parts are the number of geographically connected components formed by
    intersecting each district with the county — a district split into two
    disconnected areas within a county counts as 2 parts, not 1. For unfinished
    districting plans, the actual split parts does not treat the unassigned area as
    a zone, and completely unassigned counties will thus have a part-count of 0.

    component_populations is the population of each of the county's own connected
    components, independent of any document/plan (e.g. islands, exclaves) — used to
    compute a forced-minimum split count tighter than ceil(total_pop/ideal_pop) for
    counties that are themselves already multiple disconnected land pieces.

    The number of counties split into two or more parts can be easily derived from this
    mapping by counting the number of counties where `actual_split_parts` is 2 or more.
    """
    county_pops = COUNTY_CONTEXT.county_populations(
        context.parent_layer, context.session
    )
    if not county_pops:
        return {}

    component_pops = COUNTY_CONTEXT.component_populations(
        context.parent_layer, context.gerrydb_table, context.session
    )

    G = get_graph(context.gerrydb_table)
    county_zone_nodes: dict[tuple[CountyGeoid, int], set[str]] = {}
    for geo_id, zone in context.zone_assignments:
        county_geoid = _geo_id_to_county_geoid(geo_id)
        county_zone_nodes.setdefault((county_geoid, zone), set()).add(geo_id)

    county_parts_count: dict[CountyGeoid, int] = dict.fromkeys(county_pops, 0)
    for (county_geoid, _zone), nodes in county_zone_nodes.items():
        G.expand_non_contiguous(nodes)
        components = G.connected_components(nodes)
        county_parts_count[county_geoid] += len(components)

    return {
        county_geoid: CountyPartsInfo(
            total_pop=pop,
            parts=county_parts_count[county_geoid],
            name=COUNTY_CONTEXT.county_name(county_geoid),
            component_populations=component_pops.get(county_geoid, []),
        )
        for county_geoid, pop in county_pops.items()
    }


def district_county_membership(
    context: DocumentEvaluationContext,
) -> dict[DistrictId, list[CountyGeoid]]:
    """Returns a mapping from district (zone) to the sorted list of county geoids
    that overlap with that district.
    """
    zone_counties: dict[DistrictId, set[CountyGeoid]] = {}
    for geo_id, zone in context.zone_assignments:
        zone_counties.setdefault(DistrictId(zone), set()).add(
            _geo_id_to_county_geoid(geo_id)
        )

    return {zone: sorted(counties) for zone, counties in zone_counties.items()}
