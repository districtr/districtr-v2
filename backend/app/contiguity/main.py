from networkx import Graph, is_connected, number_connected_components
from typing import Iterable, Hashable, Any
from app.models import UUIDType, DistrictrMap
from app.utils import assert_safe_ident
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


def expand_non_contiguous_parents(G: Graph, nodes: Iterable[str]) -> set[str]:
    """Replace non-contiguous parent nodes with their block children.

    Parent units whose blocks are geographically disconnected are stored in
    G.graph["non_contiguous_parents"]. Treating them as single nodes hides the
    disconnection, so they must be expanded to their block children before any
    connectivity check.
    """
    non_contiguous: set[str] = G.graph.get("non_contiguous_parents", set())
    expanded: set[str] = set()
    for node in nodes:
        if node in non_contiguous:
            expanded.update(G.nodes[node]["children"])
        else:
            expanded.add(node)
    return expanded


# db


def _non_contiguous_parents_expand_ctes(map_uuid: str, zone_filter: str) -> str:
    """Return the WITH … ids AS (…) CTE prefix that expands NCP parents to block children.

    Callers append their own SELECT against the `ids` CTE.
    Bind params required: :document_id, :ncp_paths.
    """
    return f"""
        WITH raw AS MATERIALIZED (
            SELECT a.zone, a.geo_id
            FROM document.assignments a
            WHERE a.document_id = :document_id
                AND a.zone IS NOT NULL
                {zone_filter}
        ),
        ncp AS (
            SELECT unnest(:ncp_paths::text[]) AS path
        ),
        ids AS (
            SELECT raw.zone, raw.geo_id FROM raw
            WHERE NOT EXISTS (SELECT 1 FROM ncp WHERE ncp.path = raw.geo_id)
            UNION ALL
            SELECT raw.zone, pce.child_path AS geo_id
            FROM raw
            JOIN ncp ON ncp.path = raw.geo_id
            JOIN parentchildedges_{map_uuid} pce ON pce.parent_path = raw.geo_id
        )"""


class ZoneContiguousNodes(BaseModel):
    zone: int
    nodes: list[str]
    node_data: dict[str, dict[str, Any]] | None = None


def get_assigned_nodes(
    session: Session,
    document_id: str,
    districtr_map: DistrictrMap,
    zones: list[int] | None = None,
    G: Graph | None = None,
) -> list[ZoneContiguousNodes]:
    """Return assigned nodes that are individually contiguous.
    Parent nodes that are not contiguous will be expanded to block-level children.

    When G is provided, non-contiguous parent nodes are expanded via parentchildedges
    in a single query.
    """
    map_uuid = str(districtr_map.uuid)
    binds: list[sa.BindParameter] = [sa.bindparam(key="document_id", type_=UUIDType)]
    params: dict[str, Any] = {"document_id": document_id}

    zone_filter = ""
    if zones is not None:
        zone_filter = "AND a.zone = ANY(:zones)"
        binds.append(sa.bindparam(key="zones", type_=ARRAY(Integer)))
        params["zones"] = zones

    non_contiguous: set[str] = G.graph.get("non_contiguous_parents", set()) if G else set()
    ncp_paths = list(non_contiguous)

    if ncp_paths:
        binds.append(sa.bindparam(key="ncp_paths", type_=ARRAY(sa.String)))
        params["ncp_paths"] = ncp_paths
        sql = sa.text(
            _non_contiguous_parents_expand_ctes(map_uuid, zone_filter) + """
            SELECT zone, array_agg(geo_id) AS nodes
            FROM ids
            GROUP BY zone"""
        ).bindparams(*binds)
    else:
        sql = sa.text(f"""
            SELECT a.zone, array_agg(a.geo_id) AS nodes
            FROM document.assignments a
            WHERE a.document_id = :document_id
                AND a.zone IS NOT NULL
                {zone_filter}
            GROUP BY a.zone""").bindparams(*binds)

    return [
        ZoneContiguousNodes(zone=row.zone, nodes=row.nodes)
        for row in session.execute(sql, params)
    ]


def get_assigned_nodes_bboxes(
    session: Session,
    document_id: str,
    districtr_map: DistrictrMap,
    zones: list[int] | None = None,
    G: Graph | None = None,
) -> list[ZoneContiguousNodes]:
    """Return contiguous assigned nodes with bounding boxes.

    For shatterable maps (child_layer + parent_layer on districtr_map), unions both
    geometry-bearing base tables so each geo_id finds its geometry regardless of level.
    For non-shatterable maps, joins against gerrydb.{gerrydb_table_name} directly.

    When G is provided, non-contiguous parent nodes are expanded to their block
    children inline via a UNION ALL against parentchildedges, so the result already
    contains block-level nodes and bboxes.
    """
    gerrydb_table_name = districtr_map.gerrydb_table_name
    child_layer = districtr_map.child_layer
    parent_layer = districtr_map.parent_layer
    map_uuid = str(districtr_map.uuid)

    binds: list[sa.BindParameter] = [sa.bindparam(key="document_id", type_=UUIDType)]
    params: dict[str, Any] = {"document_id": document_id}

    zone_filter = ""
    if zones is not None:
        zone_filter = "AND a.zone = ANY(:zones)"
        binds.append(sa.bindparam(key="zones", type_=ARRAY(Integer)))
        params["zones"] = zones

    if child_layer:
        safe_child = assert_safe_ident(child_layer)
        safe_parent = assert_safe_ident(parent_layer)
        geo_source = (
            f"(SELECT path, geometry FROM gerrydb.{safe_child} "
            f"UNION ALL SELECT path, geometry FROM gerrydb.{safe_parent}) g"
        )
    else:
        safe_table = assert_safe_ident(gerrydb_table_name)
        geo_source = f"gerrydb.{safe_table} g"

    non_contiguous: set[str] = G.graph.get("non_contiguous_parents", set()) if G else set()
    ncp_paths = list(non_contiguous)

    if ncp_paths and child_layer:
        binds.append(sa.bindparam(key="ncp_paths", type_=ARRAY(sa.String)))
        params["ncp_paths"] = ncp_paths
        sql = sa.text(
            _non_contiguous_parents_expand_ctes(map_uuid, zone_filter) + f"""
            SELECT
                ids.zone,
                array_agg(ids.geo_id) AS nodes,
                array_agg(st_xmin(Box2D(g.geometry))) AS xmin,
                array_agg(st_xmax(Box2D(g.geometry))) AS xmax,
                array_agg(st_ymin(Box2D(g.geometry))) AS ymin,
                array_agg(st_ymax(Box2D(g.geometry))) AS ymax
            FROM ids
            JOIN {geo_source} ON g.path = ids.geo_id
            GROUP BY ids.zone"""
        ).bindparams(*binds)
    else:
        sql = sa.text(f"""SELECT
            ids.zone,
            array_agg(ids.geo_id) AS nodes,
            array_agg(st_xmin(Box2D(g.geometry))) AS xmin,
            array_agg(st_xmax(Box2D(g.geometry))) AS xmax,
            array_agg(st_ymin(Box2D(g.geometry))) AS ymin,
            array_agg(st_ymax(Box2D(g.geometry))) AS ymax
        FROM (
            SELECT a.zone, a.geo_id
            FROM document.assignments a
            WHERE a.document_id = :document_id
                AND a.zone IS NOT NULL
                {zone_filter}
        ) ids
        JOIN {geo_source} ON g.path = ids.geo_id
        GROUP BY ids.zone""").bindparams(*binds)

    rows = session.execute(sql, params).fetchall()

    return [
        ZoneContiguousNodes(
            zone=row.zone,
            nodes=row.nodes,
            node_data={
                geo_id: {"xmin": xmin, "xmax": xmax, "ymin": ymin, "ymax": ymax}
                for geo_id, xmin, xmax, ymin, ymax in zip(
                    row.nodes, row.xmin, row.xmax, row.ymin, row.ymax
                )
            },
        )
        for row in rows
    ]


def get_zone_connected_component_bboxes():
    pass
