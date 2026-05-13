from networkx import Graph, is_connected, number_connected_components
from typing import Iterable, Hashable, Any
from app.models import UUIDType
from sqlmodel import Session, Integer, ARRAY
from pydantic import BaseModel
import sqlalchemy as sa

import logging

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def check_subgraph_contiguity(G: Graph, subgraph_nodes: Iterable[Hashable]) -> bool:
    SG = G.subgraph(subgraph_nodes)
    return is_connected(SG)


def subgraph_number_connected_components(
    G: Graph, subgraph_nodes: Iterable[Hashable]
) -> int:
    SG = G.subgraph(subgraph_nodes)
    return number_connected_components(SG)


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
