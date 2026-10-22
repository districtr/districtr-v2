"""Compact, immutable, numpy/scipy-backed dual-level district graph (parent
units + optional shattered child units, e.g. VTDs and the census blocks that
make them up).

A narrow, explicit API — every method below exists because a real backend
call site needs exactly that operation.

- ``geo_id in G``, ``len(G)``
- ``G.parents_of(geo_ids)`` / ``G.children_of(geo_id)`` / ``G.is_shattered_parent(geo_id)``
- subset connectivity: ``connected_components`` / ``number_connected_components``
  / ``is_connected`` over an id subset, on the subgraph induced by that subset
  (unknown ids are silently dropped) — backed by ``scipy.sparse.csgraph``
- ``G.boundary_neighbors(subset)`` — outside neighbors of a subset, one per
  boundary edge (contiguity heal's target-district vote)
- ``G.expand_non_contiguous(geo_ids)`` — in-place NCP-aware expansion for the
  contiguity endpoints

All derived structures are built eagerly in __init__ (or ``_finalize`` for the
mmap-load path) and never mutated afterward, so a cached instance is safe to
share across request threads. All returned ids are native ``str``, never
``np.str_`` (they flow into psycopg bind params, msgpack, and CSV writers).

This class has no knowledge of external storage formats — constructing one
from the pipeline's npz file is ``app.evaluation.graph_loader``'s job; this
module only knows how to build itself from validated arrays (``__init__``)
and how to read/write its own mmap disk cache (``save_cache``/``load_cache``).
"""

import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Hashable, Iterable

import numpy as np
import scipy.sparse
from numpy.typing import NDArray
from scipy.sparse import csgraph


class DualLevelGraph:
    def __init__(
        self,
        node_ids: NDArray,
        edges: NDArray,
        parent_of: NDArray,
        weighted_edges: NDArray | None = None,
        non_contiguous_parents: NDArray | None = None,
    ):
        """
        Args:
            node_ids: sorted (np.sort order) 1-D unicode array of geo_ids.
            edges: (E, 2) int32 array of node indices (undirected, one row per edge).
            parent_of: (N,) int32 array of indices into node_ids, -1 = no parent.
                Every referenced parent must itself be a node — the pipeline
                writer (``graph_to_npz_arrays``) enforces this; it is not
                rechecked at load.
            weighted_edges: (W, 3) int32 array of rows (parent_a, parent_b,
                weight): a parent-unit node-index pair on a parent boundary
                and the block-edge count between them — or None for
                non-shatterable graphs. W is the number of edges in the
                parent-level graph (one row per pair of adjacent parents).
            non_contiguous_parents: (M,) int32 array of node indices of
                parents whose blocks are disconnected, or None.
        """
        n = len(node_ids)
        self._node_ids = node_ids
        self._edges = edges
        self._parent_of = parent_of
        self._weighted_edges = (
            weighted_edges
            if weighted_edges is not None
            else np.empty((0, 3), dtype=np.int32)
        )
        self._non_contiguous_parents = (
            np.sort(non_contiguous_parents)
            if non_contiguous_parents is not None
            else np.empty(0, dtype=np.int32)
        )

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

        self._finalize()

    def _finalize(self) -> None:
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
        "weighted_edges",
        "non_contiguous_parents",
    )
    _CACHE_VERSION = 2

    def save_cache(self, cache_dir: Path) -> None:
        """Atomically write the graph as mmap-able .npy files + meta.json.

        Concurrent writers race benignly: each writes a private tmp dir and
        the first rename wins; losers discard their copy.
        """
        cache_dir = Path(cache_dir)
        cache_dir.parent.mkdir(parents=True, exist_ok=True)
        # Created beside cache_dir so the rename below stays on one
        # filesystem (atomic). The context manager removes the tmp dir on
        # every exit path; after a successful rename it is already gone,
        # which ignore_cleanup_errors tolerates. An OSError while writing
        # (e.g. ENOSPC) propagates and the caller falls back to a private
        # in-memory copy.
        with tempfile.TemporaryDirectory(
            dir=cache_dir.parent,
            prefix=f"{cache_dir.name}.tmp-",
            ignore_cleanup_errors=True,
        ) as tmp:
            tmp_dir = Path(tmp)
            for name in self._CACHE_ARRAYS:
                np.save(tmp_dir / f"{name}.npy", getattr(self, f"_{name}"))
            meta = {"cache_version": self._CACHE_VERSION}
            (tmp_dir / "meta.json").write_text(json.dumps(meta))

            try:
                os.rename(tmp_dir, cache_dir)
            except OSError:
                if (cache_dir / "meta.json").exists():
                    return  # another writer won the race
                # cache_dir exists (rename raised ENOTEMPTY) but holds no
                # valid cache — e.g. a prior writer got killed mid-rmtree on
                # the corrupt-cache path. Left alone, the rename fails the
                # same way forever and every worker falls back to a private
                # copy for the container's life. Clear it and retry once.
                shutil.rmtree(cache_dir, ignore_errors=True)
                os.rename(tmp_dir, cache_dir)

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

        g._finalize()
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

    def expand_non_contiguous(self, geo_ids: set[str]) -> set[str]:
        """Replace any non-contiguous-parent id in ``geo_ids`` with its
        children, in place, and return that same set.

        Returning the mutated set lets call sites assign the result, which
        marks the mutation where it happens. Signature is deliberately ``set[str]``,
        not ``Iterable[str]``: a broader type would force an O(len(geo_ids))
        copy just to call this. Real-world non-contiguous parents are
        vanishingly rare (as of writing, among the v2 state maps only Maine
        has any, 5 out of ~48k nodes; legacy v1 maps have more, up to ~700
        in a ~285k-node graph, but the v2 maps should be used instead), so
        the match-finding step below iterates
        ``_non_contiguous_parents`` and tests each parent's geo_id against
        the caller's set — O(len(_non_contiguous_parents)), NEVER
        O(len(geo_ids)), independent of how large the zone being expanded is.
        """
        nid = self._node_ids_list
        to_expand = [
            p for i in self._non_contiguous_parents.tolist() if (p := nid[i]) in geo_ids
        ]
        for p in to_expand:
            geo_ids.discard(p)
            geo_ids.update(self.children_of(p))
        return geo_ids

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

        Ids not in the graph are silently dropped.
        """
        idxs = self._subset_indices(subset)
        if idxs.size == 0:
            return []
        _, labels = self._labels_for(idxs)
        components: dict[int, set[str]] = {}
        for label, node_id in zip(labels.tolist(), self._node_ids[idxs].tolist()):
            components.setdefault(label, set()).add(str(node_id))
        return list(components.values())

    def boundary_neighbors(self, subset: Iterable[Hashable]) -> list[str]:
        """Nodes adjacent to the subset but outside it, one entry per edge
        crossing the subset's boundary (so a node sharing three edges with the
        subset appears three times). Ids not in the graph are silently dropped.
        """
        idxs = self._subset_indices(subset)
        if idxs.size == 0:
            return []
        starts = self._adj_offsets[idxs]
        ends = self._adj_offsets[idxs + 1]
        targets = np.concatenate(
            [self._adj[s:e] for s, e in zip(starts.tolist(), ends.tolist())]
        )
        outside = targets[~np.isin(targets, idxs)]
        return [str(n) for n in self._node_ids[outside].tolist()]

    def number_connected_components(self, subset: Iterable[Hashable]) -> int:
        idxs = self._subset_indices(subset)
        if idxs.size == 0:
            return 0
        n_components, _ = self._labels_for(idxs)
        return n_components

    def is_connected(self, subset: Iterable[Hashable]) -> bool:
        n = self.number_connected_components(subset)
        if n == 0:
            raise ValueError("Connectivity is undefined for an empty subgraph")
        return n == 1
