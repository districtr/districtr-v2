from networkx import Graph, is_connected, read_gml
from typing import Iterable, Hashable
from app.utils import download_file_from_s3
from app.core.config import settings
from sqlmodel import Session
from urllib.parse import urlparse
from pydantic import BaseModel
import sqlalchemy as sa

import logging

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def check_subgraph_contiguity(G: Graph, subgraph_nodes: Iterable[Hashable]):
    SG = G.subgraph(subgraph_nodes)
    return is_connected(SG)


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
