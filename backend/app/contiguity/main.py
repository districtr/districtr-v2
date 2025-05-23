from networkx import (
    Graph,
    is_connected,
    number_connected_components,
    read_gml,
    write_gml,
)
from typing import Iterable, Hashable, Any
from app.models import UUIDType
from app.core.io import download_file_from_s3
from app.core.config import settings, Environment
from sqlmodel import Session, Integer, ARRAY
from urllib.parse import urlparse
from pydantic import BaseModel
import sqlalchemy as sa
from pathlib import Path
import sqlite3
from enum import Enum
import pickle

import logging

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

S3_GRAPH_PREFIX = "graphs"
S3_BLOCK_PATH = f"s3://{settings.R2_BUCKET_NAME}/{S3_GRAPH_PREFIX}"


def check_subgraph_contiguity(G: Graph, subgraph_nodes: Iterable[Hashable]) -> bool:
    SG = G.subgraph(subgraph_nodes)
    return is_connected(SG)


def subgraph_number_connected_components(
    G: Graph, subgraph_nodes: Iterable[Hashable]
) -> int:
    SG = G.subgraph(subgraph_nodes)
    return number_connected_components(SG)


class GraphFileFormat(str, Enum):
    gml = "Graph Modeling Language"
    pkl = "Pickle"

    def format_filepath(self, filepath: str | Path) -> Path:
        if self == GraphFileFormat.gml:
            return Path(f"{filepath}.gml.gz")
        elif self == GraphFileFormat.pkl:
            return Path(f"{filepath}.pkl")

        raise NotImplementedError(f"{self.__name__} {self} filepath format unsupported")

    def read_graph(self, filepath: str | Path) -> Graph:
        if self == GraphFileFormat.gml:
            return read_gml(filepath)
        elif self == GraphFileFormat.pkl:
            with open(filepath, "rb") as f:
                return pickle.load(f)

        raise NotImplementedError(f"{self.__name__} {self} filepath format unsupported")

    def write_graph(self, G: Graph, filepath: str | Path) -> Path:
        out_path = self.format_filepath(filepath=filepath)

        if self == GraphFileFormat.gml:
            write_gml(G=G, path=out_path)
        elif self == GraphFileFormat.pkl:
            with open(out_path, "wb") as f:
                pickle.dump(obj=G, file=f)
                f.close()

        return out_path


def get_gerrydb_graph_file(
    gerrydb_name: str,
    prefix: str = settings.VOLUME_PATH,
    graph_file_format: GraphFileFormat = GraphFileFormat.pkl,
) -> str:
    """
    Get the path to the GerryDB graph file.

    First checks if the file exists locally, then checks if it exists in S3.
    If it exists in S3, it downloads it to the local volume.

    Args:
        gerrydb_name (str): The name of the GerryDB.
        prefix (str, optional): The prefix to use for the path. Defaults to settings.VOLUME_PATH.

    Returns:
        str: The path to the GerryDB graph file.
    """
    possible_local_path = graph_file_format.format_filepath(
        f"{Path(prefix) / S3_GRAPH_PREFIX}/{gerrydb_name}"
    )
    logger.info("Possible local path: %s", possible_local_path)

    if possible_local_path.exists():
        logger.info("Local path exists")
        return str(possible_local_path)

    logger.info("Local path does not exist")

    logger.info("Checking S3")
    s3_prefix = graph_file_format.format_filepath(gerrydb_name)
    s3_key = f"{S3_GRAPH_PREFIX}/{s3_prefix}"

    logger.info("S3 key: %s", s3_key)

    s3 = settings.get_s3_client()
    assert s3, "S3 client is not available"
    s3.head_object(Bucket=settings.R2_BUCKET_NAME, Key=s3_key)

    s3_path = f"s3://{settings.R2_BUCKET_NAME}/{s3_key}"

    return s3_path


def get_gerrydb_block_graph(
    file_path: str,
    replace_local_copy: bool = False,
    graph_file_format: GraphFileFormat = GraphFileFormat.pkl,
) -> Graph:
    url = urlparse(file_path)
    logger.info("URL: %s", url)

    if url.scheme == "s3":
        s3 = settings.get_s3_client()
        assert s3, "S3 client is not available"
        path = download_file_from_s3(s3=s3, url=url, replace=replace_local_copy)
    else:
        path = file_path

    logger.info("Path: %s", path)
    G = graph_file_format.read_graph(path)

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
        Graph
    """
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
    logger.info("Num edges %s", len(edgelist))
    G = Graph(edgelist)

    return G


def write_graph(
    G: Graph,
    gerrydb_name: str,
    out_path: str | Path | None = None,
    upload_to_s3: bool = False,
    graph_file_format: GraphFileFormat = GraphFileFormat.pkl,
) -> Path:
    """
    Write a graph file to the VOLUME_PATH directory. Defaults to a pickle.

    Args:
        G (Graph): Graph to write
        gerrydb_name (str): Name of the GerryDB. Used to name the graph file
        out_path (str | Path): Path to write the graph file to. If None, must specify gerrydb_name.
        upload_to_s3 (bool): Whether to upload to graph file to S3
        graph_file_format (GraphFileFormat): Format to export the graph with, either gml or pkl

    Returns:
        Path to the exported graph file
    """
    graph_prefix = Path(settings.VOLUME_PATH) / gerrydb_name

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
        s3_filename = graph_file_format.write_graph(G=G, filepath=gerrydb_name)
        logger.info(f"S3 filename: {s3_filename}")
        s3.upload_file(
            str(path), settings.R2_BUCKET_NAME, f"{S3_GRAPH_PREFIX}/{s3_filename}"
        )
        logger.info(
            f"Graph file uploaded to S3 at s3://{settings.R2_BUCKET_NAME}/{S3_GRAPH_PREFIX}/{s3_filename}"
        )

    return path


# db


class ZoneBlockNodes(BaseModel):
    zone: int
    nodes: list[str]
    node_data: dict[str, dict[str, Any]] | None = None


def get_block_assignments(
    session: Session, document_id: str, zones: list[int] | None = None
) -> list[ZoneBlockNodes]:
    args = ":document_id"
    binds = [sa.bindparam(key="document_id", type_=UUIDType)]
    params: dict[str, Any] = {"document_id": document_id}

    if zones is not None:
        args += ", :zones"
        binds.append(sa.bindparam(key="zones", type_=ARRAY(Integer)))
        params["zones"] = zones

    sql = sa.text(f"""SELECT
        zone,
        array_agg(geo_id) AS nodes
    FROM
        get_block_assignments({args}) block_assignments
    WHERE
        zone IS NOT NULL
    GROUP BY
        zone""").bindparams(
        *binds,
    )

    result = session.execute(sql, params)
    zone_block_nodes = []

    for row in result:
        logger.info(f"Loading block assignments for {row.zone}")
        zone_block_nodes.append(
            ZoneBlockNodes(
                zone=row.zone,
                nodes=row.nodes,
            )
        )

    return zone_block_nodes


def get_block_assignments_bboxes(
    session: Session, document_id: str, zones: list[int] | None = None
) -> list[ZoneBlockNodes]:
    args = ":document_id"
    binds = [sa.bindparam(key="document_id", type_=UUIDType)]
    params: dict[str, Any] = {"document_id": document_id}

    if zones is not None:
        args += ", :zones"
        binds.append(sa.bindparam(key="zones", type_=ARRAY(Integer)))
        params["zones"] = zones

    sql = sa.text(f"""SELECT
        zone,
        array_agg(geo_id) AS nodes,
        array_agg(st_xmin(bbox)) AS xmin,
        array_agg(st_xmax(bbox)) AS xmax,
        array_agg(st_ymin(bbox)) AS ymin,
        array_agg(st_ymax(bbox)) AS ymax
    FROM
        get_block_assignments_bboxes({args}) block_assignments
    WHERE
        zone IS NOT NULL
    GROUP BY
        zone""").bindparams(
        *binds,
    )

    result = session.execute(sql, params)
    zone_block_nodes = []

    for row in result:
        logger.info(f"Loading block assignments for {row.zone}")
        zone_block_nodes.append(
            ZoneBlockNodes(
                zone=row.zone,
                nodes=row.nodes,
                # TODO: Kind of ugly, maybe reimplement
                node_data={
                    geo_id: {"xmin": xmin, "xmax": xmax, "ymin": ymin, "ymax": ymax}
                    for geo_id, xmin, xmax, ymin, ymax in zip(
                        row.nodes, row.xmin, row.xmax, row.ymin, row.ymax
                    )
                },
            )
        )

    return zone_block_nodes


def get_zone_connected_component_bboxes():
    pass
