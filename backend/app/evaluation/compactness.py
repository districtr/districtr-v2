"""Geometric compactness measures for electoral districts."""

import logging
from typing import Iterable, TypedDict

import sqlmodel

from app.evaluation.context import DocumentEvaluationContext
from app.evaluation.graph import get_graph
from app.models import Assignments

logger = logging.getLogger(__name__)


class CutEdgesResult(TypedDict):
    cut_count: int
    unit_type: str


def _infer_unit_type(geo_id: str) -> str:
    """Infer the geographic unit type from one geo_id."""
    return "block" if ":" not in geo_id else geo_id.split(":", 1)[0]


def block_cut_edges(context: DocumentEvaluationContext) -> CutEdgesResult:
    """Returns the number of cut edges and geographic unit type for the districting
    plan, defaulting to block cut edges.

    For shatterable maps (those with a ``child_layer``), uses a two-step algorithm
    to avoid iterating millions of block-level edges on every evaluation:

    Step 1 — Parent-unit pass: for every parent-unit boundary where neither unit
    has been shattered (i.e. no child blocks are individually assigned), add the
    pre-aggregated edge weight (number of block edges crossing that boundary) if
    the two parent units are in different zones.

    Step 2 — Individual-unit pass: for every individually-assigned unit, iterate
    its graph neighbours. Resolve the neighbour's zone via direct unit assignment
    or parent-unit fallback (for neighbours whose parent was assigned as a whole).
    Edges between two individually-assigned units are visited from both sides;
    halve that sub-total to avoid double-counting.

    For non-shatterable maps (``child_layer`` is None), all assignments are treated
    as atomic units: Step 1 is skipped and Step 2 handles every assignment directly,
    regardless of whether paths contain a colon prefix (e.g. VTD paths like
    ``vtd:xxxxx``) or not (bare block IDs).

    Returns a dict with:
        cut_count: total number of block-level cut edges.
        unit_type: geographic unit type inferred from the assignments
            ('block' for shatterable maps or bare IDs; the colon prefix
            such as 'vtd' for non-shatterable maps with prefixed geo_ids).
    """
    child_gerrydb_name = context.child_layer
    is_shatterable = child_gerrydb_name is not None
    gerrydb_name = child_gerrydb_name or context.gerrydb_table

    # Load assignments first — this cheap DB query determines how much graph work
    # is actually needed, allowing us to skip the block graph entirely when all
    # assignments are at the parent-unit level and the adjacency is already cached.
    rows = context.session.exec(
        sqlmodel.select(Assignments.geo_id, Assignments.zone)
        .where(Assignments.document_id == context.document_id)
        .where(Assignments.zone.isnot(None))  # type: ignore[union-attr]
    ).all()

    unit_to_zone: dict[str, int] = {}
    parent_unit_to_zone: dict[str, int] = {}
    for geo_id, zone in rows:
        # For shatterable maps, colon-prefixed geo_ids are parent-layer assignments
        # (e.g. "vtd:xxxxx"); bare IDs are individually-assigned child units.
        # For non-shatterable maps the colon check is skipped: all assignments are
        # atomic units regardless of path format.
        if is_shatterable and ":" in geo_id:
            parent_unit_to_zone[geo_id] = zone
        else:
            unit_to_zone[geo_id] = zone


    cut_count = 0

    # Step 1 (see above)
    if is_shatterable:
        parent_adj = get_graph(context.parent_layer)
        for parent_a, parent_b, data in parent_adj.edges(data=True):
            zone_a = parent_unit_to_zone.get(parent_a)
            zone_b = parent_unit_to_zone.get(parent_b)
            if zone_a is None or zone_b is None:
                continue
            if zone_a != zone_b:
                cut_count += data.get("weight", 1)
    if not unit_to_zone:
        return {"cut_count": cut_count, "unit_type": "block"}

    # Step 2 (see above)
    unit_type = _infer_unit_type(next(iter(unit_to_zone)))
    G = get_graph(gerrydb_name)
    if G is None:
        logger.warning(
            f"cut_edges [{gerrydb_name}]: no graph available, skipping per-unit cut count"
        )
        return {"cut_count": cut_count, "unit_type": unit_type}
    half_cut = 0
    for unit, zone_unit in unit_to_zone.items():
        for neighbor in G.neighbors(unit):
            if neighbor in unit_to_zone:
                # Both sides individually assigned — edge seen from both sides.
                if zone_unit != unit_to_zone[neighbor]:
                    half_cut += 1
            elif is_shatterable:
                # Neighbor belongs to a whole parent unit (or its parent is unassigned).
                parent = G.nodes[neighbor].get("parent")
                if zone_unit != parent_unit_to_zone.get(parent):
                    cut_count += 1
            else:
                # Non-shatterable map: neighbor is unassigned — always a cut edge.
                cut_count += 1
    cut_count += half_cut // 2

    return {"cut_count": cut_count, "unit_type": unit_type}


def polsby_popper(context: DocumentEvaluationContext) -> dict[int, float]:
    """Returns the per-district Polsby-Popper compactness score for the districting plan."""
    pass
