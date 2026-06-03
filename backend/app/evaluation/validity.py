"""
Computes basic evaluation information, including the number of blocks assigned,
contiguity, and population deviation.
"""

from typing import TypedDict

from app.contiguity.main import check_subgraph_contiguity
from app.evaluation.context import DocumentEvaluationContext, TOTAL_POP_COL, GeoUnitTypeName
from app.evaluation.graph import get_graph


class AssignedUnitsResult(TypedDict):
    assigned_count: int
    partially_assigned_count: int
    total_count: int
    unit_type: GeoUnitTypeName


def assigned_units(context: DocumentEvaluationContext) -> AssignedUnitsResult:
    """Returns assigned and total parent-unit counts for the document's districting plan."""
    unit_to_zone, parent_unit_to_zone = context.split_zone_assignments
    if not context.is_shatterable:
        return {
            "assigned_count": len(unit_to_zone),
            "partially_assigned_count": 0,
            "total_count": context.num_parent_units,
            "unit_type": context.parent_geo_unit_type,
        }

    assigned_count = len(parent_unit_to_zone)
    if not unit_to_zone:
        return {
            "assigned_count": assigned_count,
            "partially_assigned_count": 0,
            "total_count": context.num_parent_units,
            "unit_type": context.parent_geo_unit_type,
        }
    
    G = get_graph(context.gerrydb_table)
    partially_assigned_parents = {
        parent
        for unit in unit_to_zone
        if (parent := G.nodes[unit].get("parent"))
    }
    fully_shattered = {
        parent for parent in partially_assigned_parents
        if all(child in unit_to_zone for child in G.nodes[parent].get("children", set()))
    }
    return {
        "assigned_count": assigned_count + len(fully_shattered),
        "partially_assigned_count": len(partially_assigned_parents) - len(fully_shattered),
        "total_count": context.num_parent_units,
        "unit_type": context.parent_geo_unit_type,
    }


class PopulationDeviationResults(TypedDict):
    most_populous_district: int
    least_populous_district: int
    top_to_bottom_deviation: float
    maximal_absolute_deviation: int


def population_deviation(context: DocumentEvaluationContext) -> PopulationDeviationResults:
    """Returns the population deviation statistics for the submitted plan."""
    col = context.demographic_data[TOTAL_POP_COL]
    most_populous_zone = int(col.idxmax())
    least_populous_zone = int(col.idxmin())
    most_pop = col[most_populous_zone]
    least_pop = col[least_populous_zone]
    ideal = context.ideal_population
    top_to_bottom_deviation = (most_pop - least_pop) / least_pop if least_pop != 0 else float("inf")
    maximal_absolute_deviation = int((col - ideal).abs().max())
    return {
        "most_populous_district": most_populous_zone,
        "least_populous_district": least_populous_zone,
        "top_to_bottom_deviation": top_to_bottom_deviation,
        "maximal_absolute_deviation": maximal_absolute_deviation,
    }

def ideal_population(context: DocumentEvaluationContext) -> int:
    """Returns the ideal population per district (total population ÷ number of districts)."""
    return context.ideal_population


def unassigned_population(context: DocumentEvaluationContext) -> tuple[int, int]:
    """Returns (unassigned_population, total_population) for the document's plan."""
    return context.unassigned_population, context.total_population


def contiguous(context: DocumentEvaluationContext) -> dict[int, bool]:
    """Returns whether the submitted plan is contiguous.

    Parent units listed in G.graph["non_contiguous_parents"] are expanded to
    their block children so that precincts with disconnected geographic parts
    (e.g. island VTDs) are not falsely reported as contiguous.
    """
    assignment_rows = context.zone_assignments
    G = get_graph(context.gerrydb_table)
    non_contiguous_parents: set[str] = G.graph.get("non_contiguous_parents", set())
    zone_to_nodes: dict[int, set[str]] = {}
    for geoid, zone in assignment_rows:
        nodes = zone_to_nodes.setdefault(zone, set())
        if geoid in non_contiguous_parents:
            nodes.update(G.nodes[geoid]["children"])
        else:
            nodes.add(geoid)
    return {
        zone: check_subgraph_contiguity(G, nodes)
        for zone, nodes in zone_to_nodes.items()
    }