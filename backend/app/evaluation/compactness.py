"""Geometric compactness measures for electoral districts."""

import logging
import math

import shapely
from shapely import geometry

from app.evaluation.context import DocumentEvaluationContext
from app.evaluation.graph import get_graph
from app.evaluation.types import CutEdgesResult, DistrictId

logger = logging.getLogger(__name__)


def block_cut_edges(context: DocumentEvaluationContext) -> CutEdgesResult:
    """Returns the number of cut edges and geographic unit type for the districting
    plan, defaulting to block cut edges.

    For shatterable maps (those with a ``child_layer``), uses a two-step algorithm
    to avoid iterating millions of block-level edges on every evaluation:

    Step 1 — Parent-unit pass: for every parent-unit boundary where neither unit has
    been shattered (i.e. no child blocks are individually assigned), add the
    pre-aggregated edge weight (number of block edges crossing that boundary) if the
    two parent units are in different zones.

    Step 2 — Individual-unit pass: for every individually-assigned unit, iterate its
    graph neighbours. Resolve the neighbour's zone via direct unit assignment or
    parent-unit fallback (for neighbours whose parent was assigned as a whole).
    Edges between two individually-assigned units are visited from both sides; halve
    that sub-total to avoid double-counting.

    For non-shatterable maps (``child_layer`` is None), Step 2 handles every assignment
    directly, regardless of whether paths contain a colon prefix (e.g. VTD paths like
    ``vtd:xxxxx``) or not (bare block IDs).

    Returns a dict with:
            cut_count: total number of block-level cut edges.
            unit_type: geographic unit type inferred from the assignments
                ('block' for shatterable maps or bare IDs; possibly 'vtd' or 'bg' for
                non-shatterable maps).
    """
    unit_type = "block" if context.is_shatterable else context.parent_geo_unit_type
    unit_to_zone, parent_unit_to_zone = context.split_zone_assignments

    cut_count = 0

    G = get_graph(context.gerrydb_table)
    # Step 1 (see above)
    if context.is_shatterable:
        for (parent_a, parent_b), weight in G.graph["weighted_edges"].items():
            zone_a = parent_unit_to_zone.get(parent_a)
            zone_b = parent_unit_to_zone.get(parent_b)
            if zone_a is None or zone_b is None:
                continue
            if zone_a != zone_b:
                # For shatterable maps, weights represent block-edge counts across parent
                # boundaries. For non-shatterable maps, we count cut edges unweighted.
                cut_count += weight
    if not unit_to_zone:
        return {"cut_count": cut_count, "unit_type": unit_type}

    # Step 2 (see above)
    half_cut = 0
    for unit, zone_unit in unit_to_zone.items():
        for neighbor in G.neighbors(unit):
            if neighbor in unit_to_zone:
                # Both sides individually assigned — edge seen from both sides.
                if zone_unit != unit_to_zone[neighbor]:
                    half_cut += 1
            else:
                parent = G.nodes[neighbor].get("parent")
                # Only look at block level neighbours now by checking whether they have
                # a parent, looking at direct parent-unit neighbers would be
                # double-counting edges and subsume many block-to-block edges as a
                # single block-to-parent edge.
                if (
                    parent
                    and parent in parent_unit_to_zone
                    and zone_unit != parent_unit_to_zone[parent]
                ):
                    cut_count += 1
    cut_count += half_cut // 2
    return {"cut_count": cut_count, "unit_type": unit_type}


def _district_polsby_popper(geom: geometry.base.BaseGeometry) -> float:
    """Polsby-Popper score for a single already-projected district.

    Formula: 4 * π * Area / Perimeter^2
    """
    return 4 * math.pi * geom.area / (geom.length**2)


def polsby_popper(context: DocumentEvaluationContext) -> dict[DistrictId, float]:
    """Returns the per-district Polsby-Popper compactness score for a districting plan."""
    return {
        zone: _district_polsby_popper(geom)
        for zone, geom in context.projected_district_geometries.items()
    }


def _district_reock(geom: geometry.base.BaseGeometry) -> float:
    """Reock score for a single already-projected district.

    Formula: Area / Area of minimum bounding circle
    """
    # Not using minimum_bounding_circle — approximated via minimum bounding radius.
    min_circle_radius = shapely.minimum_bounding_radius(geom)
    return geom.area / (math.pi * min_circle_radius**2)


def reock(context: DocumentEvaluationContext) -> dict[DistrictId, float]:
    """Returns the per-district Reock compactness score for a districting plan."""
    return {
        zone: _district_reock(geom)
        for zone, geom in context.projected_district_geometries.items()
    }
