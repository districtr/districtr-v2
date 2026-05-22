"""
Computes basic evaluation information, including the number of blocks assigned,
contiguity, and population deviation.
"""

from typing import TypedDict

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
    parent_graph = get_graph(context.parent_layer)
    assigned_count = len(parent_unit_to_zone)
    if not unit_to_zone:
        return {
            "assigned_count": assigned_count,
            "partially_assigned_count": 0,
            "total_count": parent_graph.number_of_nodes(),
            "unit_type": context.parent_geo_unit_type,
        }
    
    assert context.is_shatterable
    child_graph = get_graph(context.child_layer)
    partially_assigned_parents = {
        parent
        for unit in unit_to_zone
        if (parent := child_graph.nodes[unit].get("parent"))
    }
    fully_shattered = {
        parent for parent in partially_assigned_parents
        if all(child in unit_to_zone for child in parent_graph.nodes[parent].get("children", set()))
    }
    return {
        "assigned_count": assigned_count + len(fully_shattered),
        "partially_assigned_count": len(partially_assigned_parents) - len(fully_shattered),
        "total_count": parent_graph.number_of_nodes(),
        "unit_type": context.parent_geo_unit_type,
    }


class PopulationDeviationResults(TypedDict):
    most_populous_district: int
    least_populous_district: int
    deviation: float

def population_deviation(context: DocumentEvaluationContext) -> PopulationDeviationResults:
    """Returns the population deviation statistics for the submitted plan."""
    col = context.demographic_data[TOTAL_POP_COL]
    most_populous_zone = int(col.idxmax())
    least_populous_zone = int(col.idxmin())
    most_pop = col[most_populous_zone]
    least_pop = col[least_populous_zone]
    deviation = (most_pop - least_pop) / least_pop if least_pop != 0 else float("inf")
    return {
        "most_populous_district": most_populous_zone,
        "least_populous_district": least_populous_zone,
        "deviation": deviation,
    }