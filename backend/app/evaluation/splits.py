"""County splits metrics.

Each public function takes a `DocumentEvaluationContext` and returns a mapping from
county's geoid to the forced and actual splits by the document's districts.
"""

from app.contiguity.main import (
    expand_non_contiguous_parents,
    subgraph_connected_components,
)
from app.evaluation.context import (
    COUNTY_CONTEXT,
    DocumentEvaluationContext,
    CountyGeoid,
)
from app.evaluation.graph import get_graph
from app.evaluation.types import CountyPiecesInfo, DistrictId


def _geo_id_to_county_geoid(geo_id: str) -> CountyGeoid:
    bare = geo_id.split(":", 1)[1] if ":" in geo_id else geo_id
    return CountyGeoid(bare[:5])


def county_pieces(
    context: DocumentEvaluationContext,
) -> dict[CountyGeoid, CountyPiecesInfo]:
    """Returns a mapping from county geoid to a tuple of
    (population, actual_split_pieces, county_name).

    A "split" occurs when a county is divided across multiple districts. The "actual"
    split pieces are the number of geographically connected components formed by
    intersecting each district with the county — a district split into two
    disconnected areas within a county counts as 2 pieces, not 1. For unfinished
    districting plans, the actual split pieces does not treat the unassigned area as
    a zone, and completely unassigned counties will thus have a piece-count of 0.

    The number of counties split into two or more pieces can be easily derived from this
    mapping by counting the number of counties where `actual_split_pieces` is 2 or more.
    """
    county_pops: dict[CountyGeoid, int] = COUNTY_CONTEXT.county_populations(
        context.parent_layer, context.session
    )
    county_component_pops: dict[CountyGeoid, list[int]] = (
        COUNTY_CONTEXT.county_component_populations(
            context.parent_layer, context.session
        )
    )

    county_pieces_count: dict[CountyGeoid, int] = {}
    if county_pops:
        G = get_graph(context.gerrydb_table)
        county_zone_nodes: dict[tuple[CountyGeoid, int], set[str]] = {}
        for geo_id, zone in context.zone_assignments:
            county_geoid = _geo_id_to_county_geoid(geo_id)
            if county_geoid not in county_pops:
                continue
            county_zone_nodes.setdefault((county_geoid, zone), set()).add(geo_id)

        for (county_geoid, _zone), nodes in county_zone_nodes.items():
            expanded_nodes = expand_non_contiguous_parents(G, nodes)
            components = subgraph_connected_components(G, expanded_nodes)
            county_pieces_count[county_geoid] = county_pieces_count.get(
                county_geoid, 0
            ) + len(components)

    return {
        county_geoid: CountyPiecesInfo(
            total_pop=pop,
            pieces=county_pieces_count.get(county_geoid, 0),
            name=COUNTY_CONTEXT.county_name(county_geoid),
            component_populations=county_component_pops.get(county_geoid, []),
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
