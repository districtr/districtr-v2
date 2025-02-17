from networkx import Graph, is_connected, read_gml, write_gml
from typing import Iterable, Hashable
from app.utils import download_file_from_s3
from app.core.config import settings, Environment
from sqlmodel import Session
from urllib.parse import urlparse
from pydantic import BaseModel
import sqlalchemy as sa
from pathlib import Path
import sqlite3

import logging

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

S3_GRAPH_PREFIX = "graphs"
S3_BLOCK_PATH = f"s3://{settings.R2_BUCKET_NAME}/{S3_GRAPH_PREFIX}"


def check_subgraph_contiguity(G: Graph, subgraph_nodes: Iterable[Hashable]):
    SG = G.subgraph(subgraph_nodes)
    return is_connected(SG)


def get_gerrydb_graph_file(
    gerrydb_name: str, prefix: str = settings.VOLUME_PATH
) -> str:
    possible_local_path = Path(f"{prefix}/{gerrydb_name}.gml.gz")
    logger.info("Possible local path: %s", possible_local_path)
    print("Possible local path: %s", possible_local_path)
    if possible_local_path.exists():
        return str(possible_local_path)

    return f"{S3_BLOCK_PATH}/{gerrydb_name}.gml.gz"


def get_gerrydb_block_graph(file_path: str, replace_local_copy: bool = False) -> Graph:
    url = urlparse(file_path)
    logger.info("URL: %s", url)

    if url.scheme == "s3":
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        path = download_file_from_s3(s3=s3, url=url, replace=replace_local_copy)
    else:
        path = file_path

    logger.info("Path: %s", path)
    G = read_gml(path)

    return G


def graph_from_gpkg(
    gpkg_path: str | Path, layer_name: str = "gerrydb_graph_edge"
) -> Graph:
    """
    Convert a layer from a GeoPackage to a GML file.

    Args:
        gpkg_path (str): Path to the GeoPackage
        layer_name (str): Name of the edge layer

    Returns:
        Path to the GML file
    """
    conn = sqlite3.connect(gpkg_path)

    cursor = conn.execute(f"SELECT path_1, path_2 FROM {layer_name}")

    edgelist = cursor.fetchall()
    logger.info("Num edges %s", len(edgelist))
    G = Graph(edgelist)

    return G


def write_graph_to_gml(
    G: Graph,
    gerrydb_name: str,
    out_path: str | Path | None = None,
    upload_to_s3: bool = False,
) -> Path:
    """
    Write a graph to a GML file in the VOLUME_PATH directory.

    Args:
        G (Graph): Graph to write
        gerrydb_name (str): Name of the GerryDB. Used to name the GML file
        out_path (str | Path): Path to write the GML file to. If None, must specify gerrydb_name

    Returns:
        Path to the GML file
    """
    gml_file = f"{gerrydb_name}.gml.gz"
    gml_path = Path(settings.VOLUME_PATH) / gml_file

    if out_path:
        assert settings.ENVIRONMENT in (
            Environment.local,
            Environment.test,
        ), "out_path can only be specified in local or test environment"
        gml_path = Path(out_path)

    write_gml(G=G, path=gml_path)

    if upload_to_s3:
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        s3.upload_file(
            str(gml_path), settings.R2_BUCKET_NAME, f"{S3_GRAPH_PREFIX}/{gml_file}"
        )

    return gml_path


# db


class ZoneBlockNodes(BaseModel):
    zone: str
    nodes: list[str]


def get_block_assignments(session: Session, document_id: str) -> list[ZoneBlockNodes]:
    sql = sa.text("""SELECT
        zone,
        array_agg(geo_id) AS nodes
    FROM
        get_block_assignments(:document_id)
    GROUP BY
        zone""")

    result = session.execute(sql, {"document_id": document_id})
    zone_block_nodes = []

    for row in result:
        zone_block_nodes.append(ZoneBlockNodes(zone=row.zone, nodes=row.nodes))

    return zone_block_nodes
