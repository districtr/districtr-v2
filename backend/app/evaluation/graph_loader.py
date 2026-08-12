"""Graph I/O and runtime utilities for contiguity evaluation.

Owns every path by which a ``DualLevelDualGraph`` gets built from external
storage — the pipeline's npz format, a legacy pickled networkx graph, S3 vs.
local resolution, the shared mmap disk cache, and the per-process LRU. The
graph class itself (``app.evaluation.dual_graph``) has no knowledge of any of
these formats; it only knows how to build itself from validated arrays.
"""

import io
import logging
import pickle
import shutil
import threading
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

import botocore.exceptions
import fastapi
import numpy as np
from networkx import Graph

from app.core.config import settings
from app.evaluation.dual_graph import DualLevelDualGraph

logger = logging.getLogger(__name__)

S3_GRAPH_PREFIX = "graphs"


def get_gerrydb_graph_file(
    gerrydb_name: str,
    prefix: str = settings.VOLUME_PATH,
) -> str:
    """Resolve the path to a GerryDB graph file (npz preferred, pkl legacy).

    Prefers a local copy (e.g. docker-compose bind mounts); otherwise
    returns the S3 npz URI — `get_gerrydb_graph` falls back to the pkl
    object if the npz is missing, and a missing object surfaces as
    ClientError on fetch.
    """
    for suffix in ("npz", "pkl"):
        possible_local_path = (
            Path(prefix) / S3_GRAPH_PREFIX / f"{gerrydb_name}.{suffix}"
        )
        if possible_local_path.exists():
            return str(possible_local_path)

    return f"s3://{settings.R2_BUCKET_NAME}/{S3_GRAPH_PREFIX}/{gerrydb_name}.npz"


def from_networkx(G: Graph) -> DualLevelDualGraph:
    """Convert a pipeline-built networkx graph (pkl fallback and tests).

    Uses a plain dict for node-label-to-index translation, not vectorized
    ``searchsorted``: measured on real state-scale data (TX, ~2M edges), a
    dict lookup (one string hash, O(1) average probe) beats ``searchsorted``
    (~log2(N) ≈ 20 string-comparison steps per query at this N) by ~30-40%
    wall-clock — there's no per-call dispatch overhead here for batching to
    eliminate, unlike the mmap-backed query paths elsewhere in this module.
    """
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
    parent_of = np.full(len(node_ids), -1, dtype=np.int32)
    for node, p in node_parents.items():
        if p not in idx:
            raise ValueError(
                f"Parent {p!r} of node {node!r} is not itself a node in the "
                "graph — every referenced parent unit must be present as a "
                "node (see _build_combined_graph in the pipeline)."
            )
        parent_of[idx[node]] = idx[p]

    we = G.graph.get("weighted_edges")
    ncp = G.graph.get("non_contiguous_parents")
    return DualLevelDualGraph(
        node_ids=node_ids,
        edges=edges,
        parent_of=parent_of,
        weighted_edges=(
            {(str(a), str(b)): int(w) for (a, b), w in we.items()}
            if we is not None
            else None
        ),
        non_contiguous_parents=({str(p) for p in ncp} if ncp is not None else None),
    )


def from_npz(file) -> DualLevelDualGraph:
    """Load from an npz file path or file-like object (see pipelines
    ``graph_to_npz_arrays`` for the writer — keep the two in sync)."""
    with np.load(file, allow_pickle=False) as data:
        version = int(data["format_version"])
        if version != 1:
            raise ValueError(f"Unsupported graph npz format_version: {version}")
        node_ids = data["node_ids"]
        weighted_edges = None
        if bool(data["has_weighted_edges"]):
            nid = node_ids.tolist()
            weighted_edges = {
                (nid[a], nid[b]): int(w)
                for (a, b), w in zip(data["we_keys"].tolist(), data["we_vals"].tolist())
            }
        non_contiguous_parents = None
        if bool(data["has_non_contiguous_parents"]):
            non_contiguous_parents = set(data["non_contiguous_parents"].tolist())
        return DualLevelDualGraph(
            node_ids=node_ids,
            edges=data["edges"],
            parent_of=data["parent_of"],
            weighted_edges=weighted_edges,
            non_contiguous_parents=non_contiguous_parents,
        )


def _parse_graph_bytes(data: bytes, file_path: str) -> DualLevelDualGraph:
    if file_path.endswith(".npz"):
        return from_npz(io.BytesIO(data))
    # Legacy pickled networkx graph: convert to a compact DualLevelDualGraph
    # (~10x less resident memory); the transient nx object is freed on return.
    logger.warning("Loading legacy pkl graph %s — rebuild as npz", file_path)
    return from_networkx(pickle.loads(data))


def get_gerrydb_graph(file_path: str) -> DualLevelDualGraph:
    """Load a GerryDB graph (npz, or legacy nx pkl) from a local path or S3 URI.

    S3 objects are streamed straight into memory — the lru_cache on
    `get_graph` is the only cache, so deployments need no data volume.
    An S3 npz miss falls back to the legacy pkl object.
    """
    url = urlparse(file_path)

    if url.scheme == "s3":
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        key = url.path.lstrip("/")
        try:
            logger.info("Streaming graph from s3://%s/%s", url.netloc, key)
            response = s3.get_object(Bucket=url.netloc, Key=key)
        except botocore.exceptions.ClientError as e:
            if e.response["Error"]["Code"] != "NoSuchKey" or not key.endswith(".npz"):
                raise
            key = key.removesuffix(".npz") + ".pkl"
            logger.info("npz missing, falling back to s3://%s/%s", url.netloc, key)
            response = s3.get_object(Bucket=url.netloc, Key=key)
        return _parse_graph_bytes(response["Body"].read(), key)

    with open(file_path, "rb") as f:
        return _parse_graph_bytes(f.read(), file_path)


# Must exceed the distinct-map working set or evictions force multi-second
# cold S3 reloads; each cached graph costs real memory, so raise with care.
_GRAPH_CACHE_MAX_SIZE = 15


def _load_via_disk_cache(gerrydb_name: str) -> DualLevelDualGraph:
    """Load through the shared mmap disk cache (one physical copy per
    container across all uvicorn workers); degrade to a private in-memory
    copy if the cache directory is unusable."""
    cache_dir = Path(settings.GRAPH_CACHE_PATH) / gerrydb_name
    if (cache_dir / "meta.json").exists():
        try:
            logger.info("Loading graph %s from disk cache", gerrydb_name)
            return DualLevelDualGraph.load_cache(cache_dir)
        except Exception:
            logger.warning(
                "Corrupt graph disk cache %s — rebuilding", cache_dir, exc_info=True
            )
            shutil.rmtree(cache_dir, ignore_errors=True)

    G = get_gerrydb_graph(get_gerrydb_graph_file(gerrydb_name))
    try:
        G.save_cache(cache_dir)
        # Reload memory-mapped so this worker shares pages too.
        return DualLevelDualGraph.load_cache(cache_dir)
    except OSError:
        logger.warning(
            "Could not write graph disk cache %s — using a private copy",
            cache_dir,
            exc_info=True,
        )
        return G


@lru_cache(maxsize=_GRAPH_CACHE_MAX_SIZE)
def _load_graph(gerrydb_name: str) -> DualLevelDualGraph:
    try:
        logger.info("Graph cache miss, loading %s", gerrydb_name)
        return _load_via_disk_cache(gerrydb_name)
    except botocore.exceptions.ClientError as e:
        logger.error("Graph not found: %s", e)
        raise fastapi.HTTPException(
            status_code=404,
            detail="Graph unavailable. Unable to complete this operation.",
        )
    except Exception as e:
        logger.error("Unexpected error loading graph: %s", e)
        raise fastapi.HTTPException(
            status_code=500, detail=f"Something went wrong: {e}"
        )


# Per-graph locks so concurrent requests for the same uncached graph don't
# each fetch + deserialize it (N× memory spike); lru_cache alone dedupes
# results, not in-flight loads. Bounded by the number of distinct maps.
_graph_locks: dict[str, threading.Lock] = {}
_graph_locks_guard = threading.Lock()


def get_graph(gerrydb_name: str) -> DualLevelDualGraph:
    """Load a graph from local disk or S3, LRU-cached by gerrydb_name.

    Raises HTTPException (404 or 500) if the graph is unavailable.
    """
    with _graph_locks_guard:
        lock = _graph_locks.setdefault(gerrydb_name, threading.Lock())
    with lock:
        return _load_graph(gerrydb_name)


# Delegate for /_debug/cache and test teardown.
get_graph.cache_info = _load_graph.cache_info  # type: ignore[attr-defined]
get_graph.cache_clear = _load_graph.cache_clear  # type: ignore[attr-defined]
