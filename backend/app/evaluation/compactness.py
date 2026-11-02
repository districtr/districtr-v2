"""Geometric compactness measures for electoral districts."""

import logging
import math

import numpy as np
import shapely
from shapely import geometry

from app.evaluation.context import DocumentEvaluationContext
from app.evaluation.graph_loader import get_graph
from app.evaluation.types import CutEdgesResult, DistrictId

logger = logging.getLogger(__name__)


def block_cut_edges(context: DocumentEvaluationContext) -> CutEdgesResult:
    """Returns the number of cut edges and geographic unit type for the districting
    plan, defaulting to block cut edges.

    Returns a dict with:
            cut_count: total number of block-level cut edges.
            unit_type: geographic unit type inferred from the assignments
                ('block' for shatterable maps or bare IDs; possibly 'vtd' or 'bg' for
                non-shatterable maps).

    The count works on a zone assignment already split into whole-parent vs.
    individual ids (``DocumentEvaluationContext.split_zone_assignments``),
    in two passes:

    Step 1 (parent-unit pass): for every parent-unit boundary where
    neither unit has been shattered, add the pre-aggregated edge weight
    if the two parent units are in different zones.

    Step 2 (individual-unit pass): for every individually-assigned unit,
    walk its graph neighbours, resolving each neighbour's zone via direct
    assignment or parent-unit fallback. Edges between two
    individually-assigned units are seen from both sides; halve that
    sub-total to avoid double-counting.

    Step 1 is a vectorized numpy mask over the ``G._weighted_edges`` rows,
    reading each endpoint's zone from per-node arrays — no Python object
    is created per row. Measured on real state-scale data (PA v1, 25.5k
    parent boundaries): ~1ms/call, setup included. Both passes share one
    index-space translation of the parent ids: Step 1 reads it as
    arrays, Step 2 as the ``parent_idx_to_zone`` dict.

    The context's split is trusted as-is, not re-derived against the
    graph's own parent-unit membership: a geo_id can only reach
    ``parent_unit_to_zone`` via the upload pipeline (``_heal_or_fill``),
    which already validated it against this same graph, so the two are
    always consistent.

    Step 2 resolves every individual unit (and its neighbours) to a node
    index once, up front, via a vectorized ``searchsorted`` pass — not
    via a per-id ``G._index_of`` call inside the walk. Measured on real
    state-scale data: ``_index_of``, called once per edge-endpoint, was
    59% of this function's total time, so the walk below stays entirely in
    index space (``_adj``/``_adj_offsets``/``_parent_of`` read directly),
    never resolving a neighbour's id back to a string until the final
    result.

    Ids in either dict that aren't in ``G`` are silently excluded
    from both passes rather than raising — same convention as
    ``num_children_of``/``is_shattered_parent`` (unknown ids are just
    not there), and the same as connected_components. Deliberate:
    reachable whenever a document's assignments predate a graph
    regeneration with a different unit vocabulary, and the alternative
    — raising — would turn a stale assignment into a hard failure on
    every read instead of a quietly-partial count.
    """
    unit_type = "block" if context.is_shatterable else context.parent_geo_unit_type
    unit_to_zone, parent_unit_to_zone = context.split_zone_assignments
    G = get_graph(context.gerrydb_table)

    unit_ids = list(unit_to_zone)
    unit_idx_to_zone: dict[int, int] = {}
    if unit_ids and len(G._node_ids):
        arr = np.asarray(unit_ids, dtype=str)
        pos = np.minimum(np.searchsorted(G._node_ids, arr), len(G._node_ids) - 1)
        known = G._node_ids[pos] == arr
        idxs = np.where(known, pos, -1)
        unit_idx_to_zone = {
            int(idx): unit_to_zone[uid]
            for uid, idx in zip(unit_ids, idxs.tolist())
            if idx >= 0
        }

    parent_ids = list(parent_unit_to_zone)
    num_nodes = len(G._node_ids)
    # Zone of each whole-assigned parent, per node index (has_parent_zone
    # marks which entries are set): Step 1 reads these as arrays, Step 2
    # as the parent_idx_to_zone dict.
    has_parent_zone = np.zeros(num_nodes, dtype=bool)
    parent_zone = np.zeros(num_nodes, dtype=np.int64)
    parent_idx_to_zone: dict[int, int] = {}
    if parent_ids and num_nodes:
        parent_id_array = np.asarray(parent_ids, dtype=str)
        candidate_idx = np.minimum(
            np.searchsorted(G._node_ids, parent_id_array), num_nodes - 1
        )
        in_graph = G._node_ids[candidate_idx] == parent_id_array
        assigned_parent_idx = candidate_idx[in_graph]
        assigned_parent_zone = np.fromiter(
            parent_unit_to_zone.values(), np.int64, len(parent_ids)
        )[in_graph]
        has_parent_zone[assigned_parent_idx] = True
        parent_zone[assigned_parent_idx] = assigned_parent_zone
        parent_idx_to_zone = dict(
            zip(assigned_parent_idx.tolist(), assigned_parent_zone.tolist())
        )

    weighted_edges = G._weighted_edges.view(np.ndarray)
    parent_a, parent_b = weighted_edges[:, 0], weighted_edges[:, 1]
    crosses_zones = (
        has_parent_zone[parent_a]
        & has_parent_zone[parent_b]
        & (parent_zone[parent_a] != parent_zone[parent_b])
    )
    cut_count = int(weighted_edges[crosses_zones, 2].sum())

    if not unit_idx_to_zone:
        return {"cut_count": cut_count, "unit_type": unit_type}

    # .view(np.ndarray) strips the mmap subclass wrapper without copying
    # the underlying buffer (still the same shared physical memory) — a
    # plain ndarray's element access skips the __array_finalize__/
    # __getitem__ overhead memmap pays on every single-element read,
    # which otherwise dominates this loop's cost (measured: ~50%).
    adj = G._adj.view(np.ndarray)
    adj_offsets = G._adj_offsets.view(np.ndarray)
    parent_of = G._parent_of.view(np.ndarray)

    half_cut = 0
    for i, zone_unit in unit_idx_to_zone.items():
        s, e = adj_offsets[i], adj_offsets[i + 1]
        for ni in adj[s:e].tolist():
            if ni in unit_idx_to_zone:
                # Both sides individually assigned — edge seen from both sides.
                if zone_unit != unit_idx_to_zone[ni]:
                    half_cut += 1
            else:
                p = int(parent_of[ni])
                zone_parent = parent_idx_to_zone.get(p) if p >= 0 else None
                if zone_parent is not None and zone_unit != zone_parent:
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
