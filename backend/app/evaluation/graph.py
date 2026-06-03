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

from networkx import number_connected_components

from app.utils import assert_safe_ident
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
    cursor = conn.execute(f"SELECT path_1, path_2 FROM {assert_safe_ident(layer_name)}")
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


def _annotate_graph_with_parents(
    G: Graph,
    session: sqlmodel.Session,
    map_uuid: str,
) -> None:
    """Attach ``parent`` node attributes to block nodes using parentchildedges.

    Mutates G in place. Nodes not present in the graph are silently skipped
    (e.g. blocks outside the map boundary).
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


def _build_combined_graph(G: Graph) -> None:
    """Extend an annotated block graph (child level) in-place into a dual-level combined graph.

    Node attributes:
        child nodes — ``parent``: path of the owning parent unit (pre-existing)
        parent nodes — ``children``: set of child node paths (added here)

    Edge structure (for each original block-block edge u–v):
        - u–v is kept (direct block adjacency)
        - if parent(u) != parent(v):
            - u–parent(v) and v–parent(u) are added (cross-level boundary edges)

    An edge represents adjacency, not containment; parent-child relations do not produce
    edges in this graph.

    Graph attributes:
        ``weighted_edges``: dict mapping canonical (min, max) parent-unit pairs to the
        number of block-level edges that cross that boundary.
        ``non_contiguous_parents``: set of parent-unit paths whose child blocks form
        more than one connected component (e.g. island precincts). These are expanded
        to their block children during contiguity evaluation so that geographic
        disconnection is not hidden by the single-node representation.
    """
    G.graph["weighted_edges"] = {}

    for u, v in list(G.edges()):
        p_u = G.nodes[u]["parent"]
        p_v = G.nodes[v]["parent"]
        if p_u != p_v:
            G.add_edge(u, p_v)
            G.add_edge(v, p_u)
            key = (p_u, p_v) if p_u < p_v else (p_v, p_u)
            G.graph["weighted_edges"][key] = G.graph["weighted_edges"].get(key, 0) + 1

    for p_u, p_v in G.graph["weighted_edges"]:
        G.add_edge(p_u, p_v)

    for node, data in list(G.nodes(data=True)):
        parent = data["parent"]
        if parent:
            if "children" not in G.nodes[parent]:
                G.nodes[parent]["children"] = set()
            G.nodes[parent]["children"].add(node)

    non_contiguous = set()
    for node, data in G.nodes(data=True):
        children = data.get("children")
        if children and number_connected_components(G.subgraph(children)) > 1:
            non_contiguous.add(node)
    G.graph["non_contiguous_parents"] = non_contiguous

    logger.info(
        "Built combined dual-level graph: %d nodes, %d edges, %d parent boundaries, "
        "%d non-contiguous parents",
        G.number_of_nodes(),
        G.number_of_edges(),
        len(G.graph["weighted_edges"]),
        len(non_contiguous),
    )


def build_combined_graph_from_gpkg(
    gpkg_path: str | Path,
    session: sqlmodel.Session,
    map_uuid: str,
    layer_name: str = "gerrydb_graph_edge",
) -> Graph:
    """Build a combined dual-level graph from a GeoPackage for a shatterable map.

    Chains graph_from_gpkg → annotate_graph_with_parents → build_combined_graph
    without creating intermediate copies of the graph.
    """
    G = graph_from_gpkg(gpkg_path, layer_name=layer_name)
    _annotate_graph_with_parents(G, session, map_uuid)
    _build_combined_graph(G)
    return G
