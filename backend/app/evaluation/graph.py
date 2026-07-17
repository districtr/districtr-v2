"""Graph I/O and runtime utilities for contiguity evaluation."""

import io
import logging
import pickle
import threading
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

import botocore.exceptions
import fastapi

from app.core.config import settings
from app.evaluation.district_graph import DistrictGraph

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


def _parse_graph_bytes(data: bytes, file_path: str) -> DistrictGraph:
    if file_path.endswith(".npz"):
        return DistrictGraph.from_npz(io.BytesIO(data))
    # Legacy pickled networkx graph: convert to a compact DistrictGraph
    # (~10x less resident memory); the transient nx object is freed on return.
    logger.warning("Loading legacy pkl graph %s — rebuild as npz", file_path)
    return DistrictGraph.from_networkx(pickle.loads(data))


def get_gerrydb_graph(file_path: str) -> DistrictGraph:
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


@lru_cache(maxsize=_GRAPH_CACHE_MAX_SIZE)
def _load_graph(gerrydb_name: str) -> DistrictGraph:
    try:
        path = get_gerrydb_graph_file(gerrydb_name)
        logger.info("Graph cache miss, loading from %s", path)
        return get_gerrydb_graph(path)
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


def get_graph(gerrydb_name: str) -> DistrictGraph:
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
