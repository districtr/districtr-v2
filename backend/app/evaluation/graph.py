"""Graph I/O and runtime utilities for contiguity evaluation."""

import logging
import pickle
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

import botocore.exceptions
import fastapi
from networkx import Graph

from app.core.config import settings

logger = logging.getLogger(__name__)

S3_GRAPH_PREFIX = "graphs"


def get_gerrydb_graph_file(
    gerrydb_name: str,
    prefix: str = settings.VOLUME_PATH,
) -> str:
    """Resolve the path to a GerryDB graph pkl file.

    Prefers a local copy (e.g. docker-compose bind mounts); otherwise
    returns the S3 URI — a missing object surfaces as ClientError on fetch.
    """
    possible_local_path = Path(prefix) / S3_GRAPH_PREFIX / f"{gerrydb_name}.pkl"
    if possible_local_path.exists():
        return str(possible_local_path)

    return f"s3://{settings.R2_BUCKET_NAME}/{S3_GRAPH_PREFIX}/{gerrydb_name}.pkl"


def get_gerrydb_graph(file_path: str) -> Graph:
    """Load a GerryDB graph pkl from a local path or an S3 URI.

    S3 objects are streamed straight into memory — the lru_cache on
    `get_graph` is the only cache, so deployments need no data volume.
    """
    url = urlparse(file_path)

    if url.scheme == "s3":
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        key = url.path.lstrip("/")
        logger.info("Streaming graph from s3://%s/%s", url.netloc, key)
        response = s3.get_object(Bucket=url.netloc, Key=key)
        return pickle.loads(response["Body"].read())

    with open(file_path, "rb") as f:
        return pickle.load(f)


_GRAPH_CACHE_MAX_SIZE = 10


@lru_cache(maxsize=_GRAPH_CACHE_MAX_SIZE)
def get_graph(gerrydb_name: str) -> Graph:
    """Load a graph from local disk or S3, LRU-cached by gerrydb_name.

    Raises HTTPException (404 or 500) if the graph is unavailable.
    """
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
