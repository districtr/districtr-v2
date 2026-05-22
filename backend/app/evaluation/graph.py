"""Graph I/O, serialization, and offline precomputation utilities.

Consumed by both the backend runtime (get_graph) and the backend CLI
(create-map-graphs).
"""

import logging
import pickle
import sqlite3
from enum import Enum
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

import botocore.exceptions
import fastapi
import sqlalchemy
import sqlmodel
from networkx import Graph, read_gml, write_gml

from app.core.config import settings, Environment
from app.core.io import download_file_from_s3

logger = logging.getLogger(__name__)

_S3_GRAPH_PREFIX = "graphs"


class GraphFileFormat(str, Enum):
    gml = "Graph Modeling Language"
    pkl = "Pickle"

    def format_filepath(self, filepath: str | Path) -> Path:
        if self == GraphFileFormat.gml:
            return Path(f"{filepath}.gml.gz")
        elif self == GraphFileFormat.pkl:
            return Path(f"{filepath}.pkl")
        raise NotImplementedError(f"{self} filepath format unsupported")

    def read_graph(self, filepath: str | Path) -> Graph:
        if self == GraphFileFormat.gml:
            return read_gml(filepath)
        elif self == GraphFileFormat.pkl:
            with open(filepath, "rb") as f:
                return pickle.load(f)
        raise NotImplementedError(f"{self} read format unsupported")

    def write_graph(self, G: Graph, filepath: str | Path) -> Path:
        out_path = self.format_filepath(filepath=filepath)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        if self == GraphFileFormat.gml:
            write_gml(G=G, path=out_path)
        elif self == GraphFileFormat.pkl:
            with open(out_path, "wb") as f:
                pickle.dump(obj=G, file=f)
        return out_path



def get_gerrydb_graph_file(
    gerrydb_name: str,
    prefix: str = settings.VOLUME_PATH,
    graph_file_format: GraphFileFormat = GraphFileFormat.pkl,
) -> str:
    """Resolve the path to a GerryDB graph file.

    Checks for a local copy first; falls back to S3 if absent.
    """
    possible_local_path = graph_file_format.format_filepath(
        Path(prefix) / _S3_GRAPH_PREFIX / gerrydb_name
    )
    logger.info("Possible local path: %s", possible_local_path)

    if possible_local_path.exists():
        logger.info("Local path exists")
        return str(possible_local_path)

    logger.info("Local path does not exist, checking S3")
    s3_key = f"{_S3_GRAPH_PREFIX}/{graph_file_format.format_filepath(gerrydb_name)}"
    logger.info("S3 key: %s", s3_key)

    s3 = settings.get_s3_client()
    assert s3, "S3 client is not available"
    s3.head_object(Bucket=settings.R2_BUCKET_NAME, Key=s3_key)

    return f"s3://{settings.R2_BUCKET_NAME}/{s3_key}"


def get_gerrydb_graph(
    file_path: str,
    replace_local_copy: bool = False,
    graph_file_format: GraphFileFormat = GraphFileFormat.pkl,
) -> Graph:
    """Load a GerryDB block graph from a local path or an S3 URI."""
    url = urlparse(file_path)
    logger.info("URL: %s", url)

    if url.scheme == "s3":
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        path = download_file_from_s3(s3=s3, url=url, replace=replace_local_copy)
    else:
        path = file_path

    logger.info("Path: %s", path)
    return graph_file_format.read_graph(path)


_GRAPH_CACHE_MAX_SIZE = 10


@lru_cache(maxsize=_GRAPH_CACHE_MAX_SIZE)
def get_graph(gerrydb_name: str) -> Graph:
    """Load a graph from local disk or S3, LRU-cached by gerrydb_name.

    Raises HTTPException (404 or 500) if the graph is unavailable.
    """
    try:
        path = get_gerrydb_graph_file(gerrydb_name)
        logger.info("Graph cache miss, loading from %s", path)
        return get_gerrydb_graph(path, replace_local_copy=False)
    except botocore.exceptions.ClientError as e:
        logger.error("Graph not found: %s", e)
        raise fastapi.HTTPException(
            status_code=404,
            detail="Graph unavailable. This map does not support contiguity checks.",
        )
    except Exception as e:
        logger.error("Unexpected error loading graph: %s", e)
        raise fastapi.HTTPException(
            status_code=500, detail=f"Something went wrong: {e}"
        )


def graph_from_gpkg(
    gpkg_path: str | Path, layer_name: str = "gerrydb_graph_edge"
) -> Graph:
    """Load a GerryDB block graph from a GeoPackage edge layer."""
    url = urlparse(str(gpkg_path))
    logger.info("URL: %s", url)

    if url.scheme == "s3":
        logger.info("Downloading file from S3")
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        gpkg_path = download_file_from_s3(s3=s3, url=url, replace=False)
        logger.info("Path: %s", gpkg_path)

    conn = sqlite3.connect(gpkg_path)
    cursor = conn.execute(f"SELECT path_1, path_2 FROM {layer_name}")
    edgelist = cursor.fetchall()
    conn.close()
    logger.info("Num edges %s", len(edgelist))
    return Graph(edgelist)


def write_graph(
    G: Graph,
    gerrydb_name: str,
    out_path: str | Path | None = None,
    upload_to_s3: bool = False,
    graph_file_format: GraphFileFormat = GraphFileFormat.pkl,
) -> Path:
    """Write a graph file to VOLUME_PATH/graphs/. Defaults to pickle.

    Args:
        G: Graph to write.
        gerrydb_name: Name of the GerryDB table; used to name the graph file.
        out_path: Override output path. Only allowed in local/test environments.
        upload_to_s3: Whether to upload the graph file to S3.
        graph_file_format: Serialisation format (gml or pkl).

    Returns:
        Path to the exported graph file.
    """
    graph_prefix = Path(settings.VOLUME_PATH) / _S3_GRAPH_PREFIX / gerrydb_name

    if out_path:
        assert settings.ENVIRONMENT in (
            Environment.local,
            Environment.test,
        ), "out_path can only be specified in local or test environment"
        graph_prefix = Path(out_path)

    path = graph_file_format.write_graph(G=G, filepath=graph_prefix)

    if upload_to_s3:
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        s3_key = f"{_S3_GRAPH_PREFIX}/{graph_file_format.format_filepath(gerrydb_name)}"
        logger.info(f"S3 key: {s3_key}")
        s3.upload_file(str(path), settings.R2_BUCKET_NAME, s3_key)
        logger.info(
            f"Graph file uploaded to S3 at "
            f"s3://{settings.R2_BUCKET_NAME}/{s3_key}"
        )

    return path


def annotate_graph_with_parents(
    G: Graph,
    session: sqlmodel.Session,
    map_uuid: str,
) -> Graph:
    """Attach ``parent`` node attributes to block nodes using parentchildedges.

    Mutates G in place and returns it. Nodes not present in the graph are
    silently skipped (e.g. blocks outside the map boundary).
    """
    rows = session.execute(
        sqlalchemy.text(
            "SELECT parent_path, child_path FROM parentchildedges "
            "WHERE districtr_map = CAST(:uuid AS uuid)"
        ),
        {"uuid": map_uuid},
    ).fetchall()
    for parent_path, child_path in rows:
        if child_path in G.nodes:
            G.nodes[child_path]["parent"] = parent_path
    logger.info("Annotated %d parent edges for map %r", len(rows), map_uuid)
    return G


def build_parent_adjacency(G: Graph) -> Graph:
    """Build a weighted parent-unit adjacency graph from an annotated block graph.
    And also annotate parent nodes with their child blocks.

    Each edge weight equals the number of block-level edges crossing that
    parent-unit boundary. Block nodes without a ``parent`` attribute are skipped.
    """
    parent_G: Graph = Graph()
    for u, v in G.edges():
        parent_u = G.nodes[u].get("parent")
        parent_v = G.nodes[v].get("parent")
        if parent_u is None or parent_v is None or parent_u == parent_v:
            continue
        if parent_G.has_edge(parent_u, parent_v):
            parent_G[parent_u][parent_v]["weight"] += 1
        else:
            parent_G.add_edge(parent_u, parent_v, weight=1)
    for node, data in G.nodes(data=True):
        parent = data.get("parent")
        if parent:
            parent_G.nodes[parent].setdefault("children", set()).add(node)
    logger.info(
        "Built parent-unit adjacency: %d nodes, %d edges",
        parent_G.number_of_nodes(),
        parent_G.number_of_edges(),
    )
    return parent_G
