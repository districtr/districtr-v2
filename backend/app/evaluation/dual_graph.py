"""Compact, immutable, numpy/scipy-backed replacement for the networkx dual-level
district graph (parent units + optional shattered child units, e.g. VTDs and the
census blocks that make them up).

Same data as the pipeline-built networkx.Graph (~10x less memory: ~50 MB vs
~500 MB for a state block graph), but with an explicit, narrower API instead of
mirroring ``networkx.Graph``'s dict-like ``.nodes``/``.graph`` surface — every
method below exists because a real backend call site needs exactly that
operation, not because networkx happened to expose it.

- ``geo_id in G``, ``len(G)``
- ``G.parents_of(geo_ids)`` / ``G.children_of(geo_id)`` / ``G.is_shattered_parent(geo_id)``
- subset connectivity: ``connected_components`` / ``number_connected_components``
  / ``is_connected`` over an id subset, matching nx ``G.subgraph(...)`` semantics
  (unknown ids are silently dropped) — backed by ``scipy.sparse.csgraph``
- ``G.expand_non_contiguous(geo_ids)`` — in-place NCP-aware expansion for the
  contiguity endpoints
- ``G.cut_edges(unit_to_zone, parent_unit_to_zone)`` — block-level cut-edge count for a
  zone assignment already split into individual vs. whole-parent ids

All derived structures are built eagerly in __init__ (or ``_finalize`` for the
mmap-load path) and never mutated afterward, so a cached instance is safe to
share across request threads. All returned ids are native ``str``, never
``np.str_`` (they flow into psycopg bind params, msgpack, and CSV writers).

This class has no knowledge of external storage formats — constructing one
from a pipeline-built networkx graph or an npz file is ``app.evaluation.
graph_loader``'s job; this module only knows how to build itself from
validated arrays (``__init__``) and how to read/write its own mmap disk
cache (``save_cache``/``load_cache``).
"""

import json
import os
import shutil
from pathlib import Path
from typing import Hashable, Iterable

import numpy as np
import scipy.sparse
from scipy.sparse import csgraph


class DualLevelGraph:
    def __init__(
        self,
        node_ids: np.ndarray,
        edges: np.ndarray,
        parent_of: np.ndarray,
        weighted_edges: dict[tuple[str, str], int] | None = None,
        non_contiguous_parents: set[str] | None = None,
    ):
        """
        Args:
            node_ids: sorted (np.sort order) 1-D unicode array of geo_ids.
            edges: (E, 2) int32 array of node indices (undirected, one row per edge).
            parent_of: (N,) int32 array of indices into node_ids, -1 = no parent.
                Every referenced parent must itself be a node — callers
                (``from_networkx``/``from_npz``) enforce this at construction.
            weighted_edges: {(parent_a, parent_b): block-edge count} or None for
                non-shatterable graphs.
            non_contiguous_parents: parent ids whose blocks are disconnected.
        """
        n = len(node_ids)
        self._node_ids = node_ids
        self._edges = edges
        self._parent_of = parent_of

        # CSR adjacency: sort both edge directions by source. adj_offsets MUST
        # be int32 (matching adj's int32 dtype) — scipy.sparse.csr_array
        # silently upcasts-and-copies the mismatched array instead of aliasing
        # it when indices/indptr dtypes differ, which would defeat mmap
        # sharing on the load_cache path (see save_cache/load_cache below).
        sources = np.concatenate([edges[:, 0], edges[:, 1]])
        targets = np.concatenate([edges[:, 1], edges[:, 0]])
        order = np.argsort(sources, kind="stable")
        self._adj = targets[order]
        self._adj_offsets = np.zeros(n + 1, dtype=np.int32)
        self._adj_offsets[1:] = np.cumsum(np.bincount(sources, minlength=n))

        # Children: node indices grouped by parent (parent_of values are
        # themselves node_ids indices, so no separate parent-vocabulary
        # translation is needed — a parent's own node index is the key).
        child_idx = np.nonzero(parent_of >= 0)[0].astype(np.int32)
        by_parent = np.argsort(parent_of[child_idx], kind="stable")
        self._children_sorted = child_idx[by_parent]

        self._finalize(weighted_edges, non_contiguous_parents)

    def _finalize(
        self,
        weighted_edges: dict[tuple[str, str], int] | None,
        non_contiguous_parents: set[str] | None,
    ) -> None:
        """Build the small per-process structures derived from the arrays.

        Shared by __init__ and load_cache (the latter sets the array
        attributes directly, via mmap, then calls this to finish construction).
        """
        n = len(self._node_ids)

        parents_sorted = np.asarray(self._parent_of)[self._children_sorted]
        uniq, starts = np.unique(parents_sorted, return_index=True)
        ends = np.append(starts[1:], len(parents_sorted))
        self._children_slices: dict[int, tuple[int, int]] = {
            int(p): (int(s), int(e)) for p, s, e in zip(uniq, starts, ends)
        }

        self._weighted_edges = weighted_edges or None
        self._non_contiguous_parents: frozenset[str] = frozenset(
            non_contiguous_parents or ()
        )

        # Cached once — parents_of() is called per-request on real batches;
        # rebuilding this list per call was measured at ~97% of a single-id
        # call's cost (a fixed O(len(node_ids)) tax paid regardless of how
        # many ids were actually requested).
        self._node_ids_list: list[str] = self._node_ids.tolist()

        # scipy.sparse.csgraph-backed connectivity. Aliases (not copies) the
        # mmap'd _adj/_adj_offsets when their dtypes already match (see
        # __init__'s comment); the `data` array is a fresh small int8 array —
        # only indices/indptr need to be mmap-shared for the memory win.
        self._csr = scipy.sparse.csr_array(
            (np.ones(len(self._adj), dtype=np.int8), self._adj, self._adj_offsets),
            shape=(n, n),
        )

    # -- shared-memory disk cache -------------------------------------------
    #
    # All uvicorn workers in a container memory-map the same array files, so
    # the OS page cache keeps one physical copy of each graph regardless of
    # worker count. Only the small dicts built in _finalize are per-process.

    _CACHE_ARRAYS = (
        "node_ids",
        "edges",
        "parent_of",
        "adj",
        "adj_offsets",
        "children_sorted",
    )
    _CACHE_VERSION = 1

    def save_cache(self, cache_dir: Path) -> None:
        """Atomically write the graph as mmap-able .npy files + meta.json.

        Concurrent writers race benignly: each writes a private tmp dir and
        the first rename wins; losers discard their copy.
        """
        cache_dir = Path(cache_dir)
        tmp_dir = cache_dir.with_name(f"{cache_dir.name}.tmp-{os.getpid()}")
        tmp_dir.mkdir(parents=True, exist_ok=True)
        try:
            for name in self._CACHE_ARRAYS:
                np.save(tmp_dir / f"{name}.npy", getattr(self, f"_{name}"))
            we = self._weighted_edges
            if we:
                np.save(
                    tmp_dir / "we_a.npy",
                    np.asarray([a for a, _ in we], dtype=str),
                )
                np.save(
                    tmp_dir / "we_b.npy",
                    np.asarray([b for _, b in we], dtype=str),
                )
                np.save(
                    tmp_dir / "we_vals.npy",
                    np.asarray(list(we.values()), dtype=np.int32),
                )
            ncp = self._non_contiguous_parents
            if ncp:
                np.save(tmp_dir / "ncp.npy", np.asarray(sorted(ncp), dtype=str))
            meta = {
                "cache_version": self._CACHE_VERSION,
                "has_weighted_edges": bool(we),
                "has_non_contiguous_parents": bool(ncp),
            }
            (tmp_dir / "meta.json").write_text(json.dumps(meta))
            os.rename(tmp_dir, cache_dir)
        except OSError:
            shutil.rmtree(tmp_dir, ignore_errors=True)
            if not (cache_dir / "meta.json").exists():
                raise

    @classmethod
    def load_cache(cls, cache_dir: Path) -> "DualLevelGraph":
        """Load a graph from save_cache output, memory-mapping the arrays."""
        cache_dir = Path(cache_dir)
        meta = json.loads((cache_dir / "meta.json").read_text())
        if meta["cache_version"] != cls._CACHE_VERSION:
            raise ValueError(
                f"Unsupported graph cache_version: {meta['cache_version']}"
            )

        g = object.__new__(cls)
        for name in cls._CACHE_ARRAYS:
            setattr(
                g,
                f"_{name}",
                np.load(cache_dir / f"{name}.npy", mmap_mode="r"),
            )

        weighted_edges = None
        if meta["has_weighted_edges"]:
            weighted_edges = {
                (a, b): int(w)
                for a, b, w in zip(
                    np.load(cache_dir / "we_a.npy").tolist(),
                    np.load(cache_dir / "we_b.npy").tolist(),
                    np.load(cache_dir / "we_vals.npy").tolist(),
                )
            }
        non_contiguous_parents = None
        if meta["has_non_contiguous_parents"]:
            non_contiguous_parents = set(np.load(cache_dir / "ncp.npy").tolist())

        g._finalize(weighted_edges, non_contiguous_parents)
        return g

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

    def __contains__(self, node: Hashable) -> bool:
        return self._index_of(node) is not None

    def __len__(self) -> int:
        return len(self._node_ids)

    def parents_of(self, geo_ids: Iterable[str]) -> list[str | None]:
        """Vectorized parent lookup: one searchsorted pass over all ids.

        Unknown ids and ids without a parent both map to None.
        """
        id_list = list(geo_ids)
        if not id_list or not len(self._node_ids):
            return [None] * len(id_list)
        arr = np.asarray(id_list, dtype=str)
        pos = np.minimum(np.searchsorted(self._node_ids, arr), len(self._node_ids) - 1)
        known = self._node_ids[pos] == arr
        parent_idx = np.where(known, self._parent_of[pos], -1)
        nid = self._node_ids_list
        return [nid[p] if p >= 0 else None for p in parent_idx.tolist()]

    def children_of(self, geo_id: str) -> frozenset[str]:
        """Children of a parent unit; empty frozenset if it has none."""
        i = self._index_of(geo_id)
        if i is None:
            raise KeyError(geo_id)
        sl = self._children_slices.get(i)
        if sl is None:
            return frozenset()
        return frozenset(self._node_ids[self._children_sorted[sl[0] : sl[1]]].tolist())

    def num_children_of(self, geo_id: str) -> int:
        """Count of a parent unit's children, without materializing them.

        Use this instead of ``len(children_of(geo_id))`` when only the count
        is needed — it skips the fancy-index copy, ``tolist()``, and
        ``frozenset`` construction that ``children_of`` pays on every call.
        Unknown ids and non-parents return 0.
        """
        i = self._index_of(geo_id)
        if i is None:
            return 0
        sl = self._children_slices.get(i)
        return 0 if sl is None else sl[1] - sl[0]

    def is_shattered_parent(self, geo_id: str) -> bool:
        """Whether ``geo_id`` is a parent unit with at least one individually-
        present child node. Checked directly against the index structures —
        NOT implemented as ``bool(self.children_of(geo_id))``, which would
        build and discard a whole frozenset just to test truthiness. Unknown
        ids are not shattered parents (returns False, doesn't raise).
        """
        i = self._index_of(geo_id)
        return i is not None and i in self._children_slices

    def expand_non_contiguous(self, geo_ids: set[str]) -> None:
        """Replace any non-contiguous-parent id in ``geo_ids`` with its
        children, in place.

        Mutates ``geo_ids`` and returns nothing — same convention as
        ``list.sort()``/``set.update()``, so a caller can't mistake this for
        one that hands back a new set. Signature is deliberately ``set[str]``,
        not ``Iterable[str]``: a broader type would force an O(len(geo_ids))
        copy just to call this. Real-world non-contiguous parents are
        vanishingly rare (as of writing, only Maine has any, 5 out of ~48k
        nodes), so the match-finding step below is written to cost
        O(len(non_contiguous_parents)) — CPython's set ``&`` always iterates
        the smaller operand regardless of argument order — and NEVER
        O(len(geo_ids)), independent of how large the zone being expanded is.
        """
        to_expand = self._non_contiguous_parents & geo_ids
        for p in to_expand:
            geo_ids.discard(p)
            geo_ids.update(self.children_of(p))

    # -- subset connectivity (scipy.sparse.csgraph-backed) ------------------

    def _subset_indices(self, subset: Iterable[Hashable]) -> np.ndarray:
        """Indices of subset ids present in the graph (unknown ids dropped)."""
        ids = np.asarray([node for node in subset if isinstance(node, str)], dtype=str)
        if ids.size == 0:
            return np.empty(0, dtype=np.int64)
        pos = np.searchsorted(self._node_ids, ids)
        pos = np.minimum(pos, len(self._node_ids) - 1)
        # Cross-width unicode comparison promotes; no truncation false-positives.
        return np.unique(pos[self._node_ids[pos] == ids])

    def _labels_for(self, idxs: np.ndarray) -> tuple[int, np.ndarray]:
        """(n_components, labels) for the induced subgraph over idxs."""
        induced = self._csr[idxs][:, idxs]
        return csgraph.connected_components(induced, directed=False)

    def connected_components(self, subset: Iterable[Hashable]) -> list[set[str]]:
        """Connected components of the induced subgraph, as sets of geo_ids.

        Matches nx ``connected_components(G.subgraph(subset))``: ids not in the
        graph are silently dropped.
        """
        idxs = self._subset_indices(subset)
        if idxs.size == 0:
            return []
        _, labels = self._labels_for(idxs)
        components: dict[int, set[str]] = {}
        for label, node_id in zip(labels.tolist(), self._node_ids[idxs].tolist()):
            components.setdefault(label, set()).add(str(node_id))
        return list(components.values())

    def number_connected_components(self, subset: Iterable[Hashable]) -> int:
        idxs = self._subset_indices(subset)
        if idxs.size == 0:
            return 0
        n_components, _ = self._labels_for(idxs)
        return n_components

    def is_connected(self, subset: Iterable[Hashable]) -> bool:
        n = self.number_connected_components(subset)
        if n == 0:
            # Parity with nx is_connected on an empty subgraph
            raise ValueError("Connectivity is undefined for an empty subgraph")
        return n == 1

    # -- metrics --------------------------------------------------------------

    def cut_edges(
        self, unit_to_zone: dict[str, int], parent_unit_to_zone: dict[str, int]
    ) -> int:
        """Count block-level cut edges implied by a zone assignment already
        split into whole-parent vs. individual ids (e.g.
        ``DocumentEvaluationContext.split_zone_assignments``). Two-pass
        algorithm:

        Step 1 (parent-unit pass): for every parent-unit boundary where
        neither unit has been shattered, add the pre-aggregated edge weight
        if the two parent units are in different zones.

        Step 2 (individual-unit pass): for every individually-assigned unit,
        walk its graph neighbours, resolving each neighbour's zone via direct
        assignment or parent-unit fallback. Edges between two
        individually-assigned units are seen from both sides; halve that
        sub-total to avoid double-counting.

        Step 1's flat ``weighted_edges`` dict scan measures ~2.1ms/call on
        real state-scale data — negligible outside a hot path, so it is not
        backed by a second (parent-indexed) CSR index.

        The caller's split is trusted as-is, not re-derived against the
        graph's own parent-unit membership: a geo_id can only reach
        ``parent_unit_to_zone`` via the upload pipeline (``_heal_or_fill``),
        which already validated it against this same graph, so the two are
        always consistent.

        Step 2 resolves every individual unit (and its neighbours) to a node
        index once, up front, via a vectorized ``searchsorted`` pass — not
        via a per-id ``_index_of`` call inside the walk. Measured on real
        state-scale data: ``_index_of``, called once per edge-endpoint, was
        59% of this method's total time, so the walk below stays entirely in
        index space (``_adj``/``_adj_offsets``/``_parent_of`` read directly),
        never resolving a neighbour's id back to a string until the final
        result.
        """
        unit_ids = list(unit_to_zone)
        unit_idx_to_zone: dict[int, int] = {}
        if unit_ids and len(self._node_ids):
            arr = np.asarray(unit_ids, dtype=str)
            pos = np.minimum(
                np.searchsorted(self._node_ids, arr), len(self._node_ids) - 1
            )
            known = self._node_ids[pos] == arr
            idxs = np.where(known, pos, -1)
            unit_idx_to_zone = {
                int(idx): unit_to_zone[uid]
                for uid, idx in zip(unit_ids, idxs.tolist())
                if idx >= 0
            }

        parent_ids = list(parent_unit_to_zone)
        parent_idx_to_zone: dict[int, int] = {}
        if parent_ids and len(self._node_ids):
            parr = np.asarray(parent_ids, dtype=str)
            ppos = np.minimum(
                np.searchsorted(self._node_ids, parr), len(self._node_ids) - 1
            )
            pknown = self._node_ids[ppos] == parr
            pidxs = np.where(pknown, ppos, -1)
            parent_idx_to_zone = {
                int(idx): parent_unit_to_zone[pid]
                for pid, idx in zip(parent_ids, pidxs.tolist())
                if idx >= 0
            }

        cut_count = 0
        if self._weighted_edges:
            for (parent_a, parent_b), weight in self._weighted_edges.items():
                zone_a = parent_unit_to_zone.get(parent_a)
                zone_b = parent_unit_to_zone.get(parent_b)
                if zone_a is not None and zone_b is not None and zone_a != zone_b:
                    cut_count += weight

        if not unit_idx_to_zone:
            return cut_count

        # .view(np.ndarray) strips the mmap subclass wrapper without copying
        # the underlying buffer (still the same shared physical memory) — a
        # plain ndarray's element access skips the __array_finalize__/
        # __getitem__ overhead memmap pays on every single-element read,
        # which otherwise dominates this loop's cost (measured: ~50%).
        adj = self._adj.view(np.ndarray)
        adj_offsets = self._adj_offsets.view(np.ndarray)
        parent_of = self._parent_of.view(np.ndarray)

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
        return cut_count
