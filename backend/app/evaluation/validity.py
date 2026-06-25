"""
Computes basic evaluation information, including the number of blocks assigned,
contiguity, and population deviation.
"""

import logging

from app.contiguity.main import check_subgraph_contiguity
from app.evaluation.context import DocumentEvaluationContext, TOTAL_POP_COL
from app.evaluation.graph import get_graph
from app.evaluation.types import (
    AssignedUnitsResult,
    PopulationDeviationResults,
    UnassignedPopulation,
    DistrictId,
)

logger = logging.getLogger(__name__)


def assigned_units(context: DocumentEvaluationContext) -> AssignedUnitsResult:
    """Returns assigned and total parent-unit counts for the document's districting plan.

    assigned_count — units fully assigned to exactly one district (whole assignment or
                     all blocks shattered into the same district).
    split_count    — units fully shattered but whose blocks span two or more districts.
    partially_assigned_count — units where only some blocks are assigned.
    assigned_child_count / total_child_count — block-level counts for shatterable maps,
                     None for non-shatterable maps.
    """
    unit_to_zone, parent_unit_to_zone = context.split_zone_assignments
    if not context.is_shatterable:
        return AssignedUnitsResult(
            assigned_count=len(unit_to_zone),
            split_count=0,
            partially_assigned_count=0,
            total_count=context.num_parent_units,
            unit_type=context.parent_geo_unit_type,
            assigned_child_count=None,
            total_child_count=None,
        )

    whole_assigned_count = len(parent_unit_to_zone)
    G = get_graph(context.gerrydb_table)

    parent_covered_children = sum(
        len(G.nodes[p]["children"])
        for p in parent_unit_to_zone
        if "children" in G.nodes[p]
    )
    assigned_child_count = len(unit_to_zone) + parent_covered_children

    if not unit_to_zone:
        return AssignedUnitsResult(
            assigned_count=whole_assigned_count,
            split_count=0,
            partially_assigned_count=0,
            total_count=context.num_parent_units,
            unit_type=context.parent_geo_unit_type,
            assigned_child_count=assigned_child_count,
            total_child_count=context.num_child_units,
        )

    partially_assigned_parents = {
        parent for unit in unit_to_zone if (parent := G.nodes[unit].get("parent"))
    }

    conflicting = partially_assigned_parents & parent_unit_to_zone.keys()
    if conflicting:
        raise ValueError(
            f"Malformed assignments: {len(conflicting)} parent unit(s) appear alongside "
            f"individual child assignments for the same unit: {conflicting}. "
            "A parent and its children should not both be present in assignments."
        )

    fully_shattered_one: set[str] = set()
    fully_shattered_split: set[str] = set()
    for parent in partially_assigned_parents:
        children = G.nodes[parent].get("children", set())
        if not all(child in unit_to_zone for child in children):
            continue
        zones = {unit_to_zone[child] for child in children if child in unit_to_zone}
        if len(zones) > 1:
            fully_shattered_split.add(parent)
        else:
            logger.warning(
                "Parent unit %s is fully shattered into one zone — expected healing to have replaced its children with a single parent assignment",
                parent,
            )
            fully_shattered_one.add(parent)

    return AssignedUnitsResult(
        assigned_count=whole_assigned_count + len(fully_shattered_one),
        split_count=len(fully_shattered_split),
        partially_assigned_count=len(partially_assigned_parents)
        - len(fully_shattered_one)
        - len(fully_shattered_split),
        total_count=context.num_parent_units,
        unit_type=context.parent_geo_unit_type,
        assigned_child_count=assigned_child_count,
        total_child_count=context.num_child_units,
    )


def population_deviation(
    context: DocumentEvaluationContext,
) -> PopulationDeviationResults:
    """Returns the population deviation statistics for the submitted plan."""
    col = context.demographic_data[TOTAL_POP_COL]
    most_populous_zone = int(col.idxmax())
    least_populous_zone = int(col.idxmin())
    most_pop = col[most_populous_zone]
    least_pop = col[least_populous_zone]
    ideal = context.ideal_population
    top_to_bottom_deviation = (
        (most_pop - least_pop) / least_pop if least_pop != 0 else float("inf")
    )
    maximal_absolute_deviation = int((col - ideal).abs().max())
    return PopulationDeviationResults(
        most_populous_district=most_populous_zone,
        least_populous_district=least_populous_zone,
        top_to_bottom_deviation=top_to_bottom_deviation,
        maximal_absolute_deviation=maximal_absolute_deviation,
    )


def ideal_population(context: DocumentEvaluationContext) -> int:
    """Returns the ideal population per district (total population ÷ number of districts)."""
    return context.ideal_population


def unassigned_population(context: DocumentEvaluationContext) -> UnassignedPopulation:
    """Returns unassigned and total population for the document's plan."""
    return UnassignedPopulation(
        unassigned_population=context.unassigned_population,
        total_population=context.total_population,
    )


def contiguous(context: DocumentEvaluationContext) -> dict[DistrictId, bool]:
    """Returns whether the submitted plan is contiguous.

    Parent units listed in G.graph["non_contiguous_parents"] are expanded to
    their block children so that precincts with disconnected geographic parts
    (e.g. island VTDs) are not falsely reported as contiguous.
    """
    assignment_rows = context.zone_assignments
    G = get_graph(context.gerrydb_table)
    non_contiguous_parents: set[str] = G.graph.get("non_contiguous_parents", set())
    zone_to_nodes: dict[DistrictId, set[str]] = {}
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
