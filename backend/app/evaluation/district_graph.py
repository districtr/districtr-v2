"""Compact, immutable, numpy-backed replacement for the networkx dual-level graph.

Same data as the pipeline-built networkx.Graph (~10x less memory: ~50 MB vs
~500 MB for a state block graph) with an API mirroring the slice of networkx the
backend actually uses:

- ``geo_id in G``, ``G.nodes[id]`` / ``G.nodes.get(id)`` returning an attr dict
  with optional ``parent`` (str) and ``children`` (frozenset[str]) keys
- ``G.graph`` dict with optional ``weighted_edges`` / ``non_contiguous_parents``
- ``G.neighbors(id)``
- subset connectivity: ``connected_components`` / ``number_connected_components``
  / ``is_connected`` over an id subset, matching nx ``G.subgraph(...)`` semantics
  (unknown ids are silently dropped)

All derived structures are built eagerly in __init__ and never mutated, so a
cached instance is safe to share across request threads. All returned ids are
native ``str``, never ``np.str_`` (they flow into psycopg bind params, msgpack,
and CSV writers).
"""

from typing import Hashable, Iterable

import numpy as np
from networkx import Graph


class _NodesView:
    """Dict-like view over node attributes, mirroring ``networkx.Graph.nodes``."""

    __slots__ = ("_g",)

    def __init__(self, g: "DistrictGraph"):
        self._g = g

    def __contains__(self, node: Hashable) -> bool:
        return self._g._index_of(node) is not None

    def __getitem__(self, node: Hashable) -> dict:
        i = self._g._index_of(node)
        if i is None:
            raise KeyError(node)
        return self._g._node_attrs(i)

    def get(self, node: Hashable, default=None):
        i = self._g._index_of(node)
        return default if i is None else self._g._node_attrs(i)

    def __iter__(self):
        return iter(self._g._node_ids.tolist())

    def __len__(self) -> int:
        return len(self._g._node_ids)

    def __call__(self) -> "_NodesView":
        # nx parity: G.nodes() is the same view as G.nodes
        return self


class DistrictGraph:
    def __init__(
        self,
        node_ids: np.ndarray,
        edges: np.ndarray,
        parent_ids: np.ndarray,
        parent_of: np.ndarray,
        weighted_edges: dict[tuple[str, str], int] | None = None,
        non_contiguous_parents: set[str] | None = None,
    ):
        """
        Args:
            node_ids: sorted (np.sort order) 1-D unicode array of geo_ids.
            edges: (E, 2) int32 array of node indices (undirected, one row per edge).
            parent_ids: sorted 1-D unicode array of distinct parent unit ids.
                Parents are usually also nodes, but may not be (block graphs
                annotated with parents before the combined build).
            parent_of: (N,) int32 array of indices into parent_ids, -1 = no parent.
            weighted_edges: {(parent_a, parent_b): block-edge count} or None for
                non-shatterable graphs (key absent from ``self.graph``, as in nx).
            non_contiguous_parents: parent ids whose blocks are disconnected.
        """
        n = len(node_ids)
        self._node_ids = node_ids
        self._edges = edges
        self._parent_ids = parent_ids
        self._parent_of = parent_of

        # CSR adjacency for neighbors(): sort both edge directions by source.
        sources = np.concatenate([edges[:, 0], edges[:, 1]])
        targets = np.concatenate([edges[:, 1], edges[:, 0]])
        order = np.argsort(sources, kind="stable")
        self._adj = targets[order]
        self._adj_offsets = np.zeros(n + 1, dtype=np.int64)
        np.cumsum(np.bincount(sources, minlength=n), out=self._adj_offsets[1:])

        # Children: node indices grouped by parent (parent_ids index).
        child_idx = np.nonzero(parent_of >= 0)[0].astype(np.int32)
        by_parent = np.argsort(parent_of[child_idx], kind="stable")
        self._children_sorted = child_idx[by_parent]
        parents_sorted = parent_of[self._children_sorted]
        uniq, starts = np.unique(parents_sorted, return_index=True)
        ends = np.append(starts[1:], len(parents_sorted))
        self._children_slices: dict[int, tuple[int, int]] = {
            int(p): (int(s), int(e)) for p, s, e in zip(uniq, starts, ends)
        }

        # For each node, its index in parent_ids if the node is itself a parent
        # unit, else -1 (vectorized searchsorted over both sorted arrays).
        self._as_parent = np.full(n, -1, dtype=np.int32)
        if len(parent_ids) and n:
            pos = np.searchsorted(parent_ids, node_ids)
            pos = np.minimum(pos, len(parent_ids) - 1)
            is_parent = parent_ids[pos] == node_ids
            self._as_parent[is_parent] = pos[is_parent]

        self.graph: dict = {}
        if weighted_edges is not None:
            self.graph["weighted_edges"] = weighted_edges
        if non_contiguous_parents is not None:
            self.graph["non_contiguous_parents"] = non_contiguous_parents

        self.nodes = _NodesView(self)

    @classmethod
    def from_networkx(cls, G: Graph) -> "DistrictGraph":
        """Convert a pipeline-built networkx graph (pkl fallback and tests)."""
        node_ids = np.sort(np.asarray(list(G.nodes()), dtype=str))
        idx = {node: i for i, node in enumerate(node_ids.tolist())}
        if G.number_of_edges():
            edges = np.asarray([(idx[u], idx[v]) for u, v in G.edges()], dtype=np.int32)
        else:
            edges = np.empty((0, 2), dtype=np.int32)

        node_parents = {
            node: p
            for node, data in G.nodes(data=True)
            if (p := data.get("parent")) is not None
        }
        parent_ids = np.unique(np.asarray(list(node_parents.values()), dtype=str))
        parent_pos = {p: i for i, p in enumerate(parent_ids.tolist())}
        parent_of = np.full(len(node_ids), -1, dtype=np.int32)
        for node, p in node_parents.items():
            parent_of[idx[node]] = parent_pos[p]

        we = G.graph.get("weighted_edges")
        ncp = G.graph.get("non_contiguous_parents")
        return cls(
            node_ids=node_ids,
            edges=edges,
            parent_ids=parent_ids,
            parent_of=parent_of,
            weighted_edges=(
                {(str(a), str(b)): int(w) for (a, b), w in we.items()}
                if we is not None
                else None
            ),
            non_contiguous_parents=({str(p) for p in ncp} if ncp is not None else None),
        )

    @classmethod
    def from_npz(cls, file) -> "DistrictGraph":
        """Load from an npz file path or file-like object (see pipelines
        ``graph_to_npz_arrays`` for the writer — keep the two in sync)."""
        with np.load(file, allow_pickle=False) as data:
            version = int(data["format_version"])
            if version != 1:
                raise ValueError(f"Unsupported graph npz format_version: {version}")
            parent_ids = data["parent_ids"]
            weighted_edges = None
            if bool(data["has_weighted_edges"]):
                pid = parent_ids.tolist()
                weighted_edges = {
                    (pid[a], pid[b]): int(w)
                    for (a, b), w in zip(
                        data["we_keys"].tolist(), data["we_vals"].tolist()
                    )
                }
            non_contiguous_parents = None
            if bool(data["has_non_contiguous_parents"]):
                non_contiguous_parents = set(data["non_contiguous_parents"].tolist())
            return cls(
                node_ids=data["node_ids"],
                edges=data["edges"],
                parent_ids=parent_ids,
                parent_of=data["parent_of"],
                weighted_edges=weighted_edges,
                non_contiguous_parents=non_contiguous_parents,
            )

    # -- lookups ------------------------------------------------------------

    def _index_of(self, node: Hashable) -> int | None:
        if not isinstance(node, str):
            return None
        # searchsorted may truncate the key to the array's dtype width; the
        # equality check below compares against the original python str.
        i = int(np.searchsorted(self._node_ids, node))
        if i < len(self._node_ids) and self._node_ids[i] == node:
            return i
        return None

    def _node_attrs(self, i: int) -> dict:
        # Built per access (immutable source arrays, so thread-safe); hot loops
        # touching many nodes pay one small dict + str per call.
        attrs: dict = {}
        p = self._parent_of[i]
        if p >= 0:
            attrs["parent"] = str(self._parent_ids[p])
        as_parent = self._as_parent[i]
        sl = self._children_slices.get(int(as_parent)) if as_parent >= 0 else None
        if sl is not None:
            attrs["children"] = frozenset(
                self._node_ids[self._children_sorted[sl[0] : sl[1]]].tolist()
            )
        return attrs

    def __contains__(self, node: Hashable) -> bool:
        return self._index_of(node) is not None

    def __len__(self) -> int:
        return len(self._node_ids)

    def neighbors(self, node: str) -> list[str]:
        i = self._index_of(node)
        if i is None:
            raise KeyError(node)
        s, e = self._adj_offsets[i], self._adj_offsets[i + 1]
        return self._node_ids[self._adj[s:e]].tolist()

    # -- subset connectivity ------------------------------------------------

    def _subset_indices(self, subset: Iterable[Hashable]) -> np.ndarray:
        """Indices of subset ids present in the graph (unknown ids dropped)."""
        ids = np.asarray([node for node in subset if isinstance(node, str)], dtype=str)
        if ids.size == 0:
            return np.empty(0, dtype=np.int64)
        pos = np.searchsorted(self._node_ids, ids)
        pos = np.minimum(pos, len(self._node_ids) - 1)
        # Cross-width unicode comparison promotes; no truncation false-positives.
        return np.unique(pos[self._node_ids[pos] == ids])

    def _component_roots(self, idxs: np.ndarray) -> dict[int, int]:
        """Union-find over edges internal to the subset; returns {node_idx: root}."""
        member = np.zeros(len(self._node_ids), dtype=bool)
        member[idxs] = True
        internal = self._edges[member[self._edges[:, 0]] & member[self._edges[:, 1]]]

        # ponytail: python-loop union-find, ~0.1s per 30k-node zone. If profiling
        # ever flags it, scipy.sparse.csgraph.connected_components is the upgrade.
        uf: dict[int, int] = {}

        def find(x: int) -> int:
            root = x
            while uf.get(root, root) != root:
                root = uf[root]
            while uf.get(x, x) != root:
                uf[x], x = root, uf[x]
            return root

        for u, v in internal.tolist():
            ru, rv = find(u), find(v)
            if ru != rv:
                uf[ru] = rv

        return {i: find(i) for i in idxs.tolist()}

    def connected_components(self, subset: Iterable[Hashable]) -> list[set[str]]:
        """Connected components of the induced subgraph, as sets of geo_ids.

        Matches nx ``connected_components(G.subgraph(subset))``: ids not in the
        graph are silently dropped.
        """
        idxs = self._subset_indices(subset)
        roots = self._component_roots(idxs)
        components: dict[int, set[str]] = {}
        for i, root in roots.items():
            components.setdefault(root, set()).add(str(self._node_ids[i]))
        return list(components.values())

    def number_connected_components(self, subset: Iterable[Hashable]) -> int:
        roots = self._component_roots(self._subset_indices(subset))
        return len(set(roots.values()))

    def is_connected(self, subset: Iterable[Hashable]) -> bool:
        n = self.number_connected_components(subset)
        if n == 0:
            # Parity with nx is_connected on an empty subgraph
            raise ValueError("Connectivity is undefined for an empty subgraph")
        return n == 1
