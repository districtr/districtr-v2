"""Graph I/O and runtime utilities for contiguity evaluation.

Owns every path by which a ``DualLevelGraph`` gets built from external
storage — the pipeline's npz format, S3 vs. local resolution, the shared mmap disk cache, and the per-process LRU. The
graph class itself (``app.evaluation.dual_graph``) has no knowledge of any of
these formats; it only knows how to build itself from validated arrays.
"""

import io
import logging
import shutil
import threading
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

import botocore.exceptions
import fastapi
import numpy as np

from app.core.config import settings
from app.evaluation.dual_graph import DualLevelGraph
from app.utils import assert_safe_ident

logger = logging.getLogger(__name__)

S3_GRAPH_PREFIX = "graphs"


def get_gerrydb_graph_file(
    gerrydb_name: str,
    prefix: str = settings.VOLUME_PATH,
) -> str:
    """Resolve the path to a GerryDB graph's npz file.

    Prefers a local copy (e.g. docker-compose bind mounts); otherwise
    returns the S3 URI — a missing object surfaces as ClientError on fetch.
    """
    local_path = Path(prefix) / S3_GRAPH_PREFIX / f"{gerrydb_name}.npz"
    if local_path.exists():
        return str(local_path)

    return f"s3://{settings.AWS_S3_BUCKET}/{S3_GRAPH_PREFIX}/{gerrydb_name}.npz"


def from_npz(file) -> DualLevelGraph:
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
        return DualLevelGraph(
            node_ids=node_ids,
            edges=data["edges"],
            parent_of=data["parent_of"],
            weighted_edges=weighted_edges,
            non_contiguous_parents=non_contiguous_parents,
        )


def get_gerrydb_graph(file_path: str) -> DualLevelGraph:
    """Load a GerryDB graph's npz from a local path or S3 URI.

    S3 objects are streamed straight into memory; the disk cache and LRU
    in front of this are the only caches.
    """
    url = urlparse(file_path)

    if url.scheme == "s3":
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        key = url.path.lstrip("/")
        logger.info("Streaming graph from s3://%s/%s", url.netloc, key)
        response = s3.get_object(Bucket=url.netloc, Key=key)
        return from_npz(io.BytesIO(response["Body"].read()))

    return from_npz(file_path)


# Must exceed the distinct-map working set or evictions force multi-second
# cold S3 reloads; each cached graph costs real memory, so raise with care.
_GRAPH_CACHE_MAX_SIZE = 15


def _load_via_disk_cache(gerrydb_name: str) -> DualLevelGraph:
    """Load through the shared mmap disk cache (one physical copy per
    container across all uvicorn workers); degrade to a private in-memory
    copy if the cache directory is unusable."""
    assert_safe_ident(gerrydb_name)
    cache_dir = Path(settings.GRAPH_CACHE_PATH) / gerrydb_name
    if (cache_dir / "meta.json").exists():
        try:
            logger.info("Loading graph %s from disk cache", gerrydb_name)
            return DualLevelGraph.load_cache(cache_dir)
        except Exception:
            logger.warning(
                "Corrupt graph disk cache %s — rebuilding", cache_dir, exc_info=True
            )
            shutil.rmtree(cache_dir, ignore_errors=True)

    G = get_gerrydb_graph(get_gerrydb_graph_file(gerrydb_name))
    try:
        G.save_cache(cache_dir)
        # Reload memory-mapped so this worker shares pages too.
        return DualLevelGraph.load_cache(cache_dir)
    except OSError:
        logger.warning(
            "Could not write graph disk cache %s — using a private copy",
            cache_dir,
            exc_info=True,
        )
        return G


@lru_cache(maxsize=_GRAPH_CACHE_MAX_SIZE)
def _load_graph(gerrydb_name: str) -> DualLevelGraph:
    try:
        logger.info("Graph cache miss, loading %s", gerrydb_name)
        return _load_via_disk_cache(gerrydb_name)
    except botocore.exceptions.ClientError as e:
        logger.error("Graph not found: %s", e)
        raise fastapi.HTTPException(
            status_code=404,
            detail="Graph unavailable. Unable to complete this operation.",
        )
    except Exception:
        logger.error("Unexpected error loading graph %s", gerrydb_name, exc_info=True)
        raise fastapi.HTTPException(
            status_code=500, detail="Something went wrong loading the graph."
        )


# Per-graph locks so concurrent requests for the same uncached graph don't
# each fetch + deserialize it (N× memory spike); lru_cache alone dedupes
# results, not in-flight loads. Bounded by the number of distinct maps.
_graph_locks: dict[str, threading.Lock] = {}
_graph_locks_guard = threading.Lock()


# lru_cache doesn't cache exceptions, so a persistent S3 outage would
# otherwise serialize every request for the same graph behind one lock,
# each waiting out the full botocore timeout in turn. A bounded wait lets
# pile-up fail fast (503) instead of accumulating in the threadpool; normal
# cold loads (well under a second) never get close to it.
_GRAPH_LOCK_TIMEOUT_SECONDS = 30


def get_graph(gerrydb_name: str) -> DualLevelGraph:
    """Load a graph from local disk or S3, LRU-cached by gerrydb_name.

    Raises HTTPException (404 or 500) if the graph is unavailable, or 503
    if it's still being (re)loaded by another request past the wait budget.
    """
    with _graph_locks_guard:
        lock = _graph_locks.setdefault(gerrydb_name, threading.Lock())
    if not lock.acquire(timeout=_GRAPH_LOCK_TIMEOUT_SECONDS):
        raise fastapi.HTTPException(
            status_code=503,
            detail="Graph is taking too long to load — try again shortly.",
        )
    try:
        return _load_graph(gerrydb_name)
    finally:
        lock.release()


# Delegate for /_debug/cache and test teardown.
get_graph.cache_info = _load_graph.cache_info  # type: ignore[attr-defined]
get_graph.cache_clear = _load_graph.cache_clear  # type: ignore[attr-defined]
