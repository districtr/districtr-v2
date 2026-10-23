"""Build small DualLevelGraphs inline for tests, by geo_id rather than index."""

from collections.abc import Iterable

import numpy as np

from app.evaluation.dual_graph import DualLevelGraph


def make_graph(
    edges: Iterable[tuple[str, str]] = (),
    nodes: Iterable[str] = (),
    parents: dict[str, str] | None = None,
    weighted_edges: dict[tuple[str, str], int] | None = None,
    non_contiguous_parents: set[str] | None = None,
) -> DualLevelGraph:
    """Every id named in ``edges``, ``nodes``, or ``parents`` (keys and
    values) becomes a node; ``parents`` maps child id -> parent id.
    ``weighted_edges`` and ``non_contiguous_parents`` name parents by id and
    are translated to the constructor's index arrays."""
    edges = list(edges)
    parents = parents or {}
    ids = set(nodes) | set(parents) | set(parents.values())
    ids.update(n for edge in edges for n in edge)

    node_ids = np.sort(np.asarray(sorted(ids), dtype=str))
    idx = {node: i for i, node in enumerate(node_ids.tolist())}
    edge_arr = (
        np.asarray([(idx[u], idx[v]) for u, v in edges], dtype=np.int32)
        if edges
        else np.empty((0, 2), dtype=np.int32)
    )
    parent_of = np.full(len(node_ids), -1, dtype=np.int32)
    for child, parent in parents.items():
        parent_of[idx[child]] = idx[parent]

    return DualLevelGraph(
        node_ids=node_ids,
        edges=edge_arr,
        parent_of=parent_of,
        weighted_edges=(
            np.asarray(
                [(idx[a], idx[b], w) for (a, b), w in weighted_edges.items()],
                dtype=np.int32,
            ).reshape(-1, 3)
            if weighted_edges is not None
            else None
        ),
        non_contiguous_parents=(
            np.asarray([idx[p] for p in non_contiguous_parents], dtype=np.int32)
            if non_contiguous_parents is not None
            else None
        ),
    )
