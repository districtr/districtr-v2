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

    The cut-edge count itself (mixing whole-parent and individual-unit
    assignments, and handling shatterable vs. non-shatterable maps) is
    computed by ``DualLevelDualGraph.cut_edges`` — see that method's
    docstring for the two-pass algorithm. This function only resolves the
    unit type, which doesn't touch the graph.

    Returns a dict with:
            cut_count: total number of block-level cut edges.
            unit_type: geographic unit type inferred from the assignments
                ('block' for shatterable maps or bare IDs; possibly 'vtd' or 'bg' for
                non-shatterable maps).
    """
    unit_type = "block" if context.is_shatterable else context.parent_geo_unit_type
    unit_to_zone, parent_unit_to_zone = context.split_zone_assignments

    G = get_graph(context.gerrydb_table)
    zone_by_geo: dict[str, int] = {**parent_unit_to_zone, **unit_to_zone}
    cut_count = G.cut_edges(zone_by_geo)
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
