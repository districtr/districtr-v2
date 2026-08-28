from typing import Iterable, Hashable, Any
from app.evaluation.dual_graph import DualLevelGraph
from app.models import UUIDType, DistrictrMap
from app.utils import assert_safe_ident
from sqlmodel import Session, Integer, ARRAY
from pydantic import BaseModel
import sqlalchemy as sa

import logging

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def check_subgraph_contiguity(
    G: DualLevelGraph, subgraph_nodes: Iterable[Hashable]
) -> bool:
    return G.is_connected(subgraph_nodes)


def subgraph_number_connected_components(
    G: DualLevelGraph, subgraph_nodes: Iterable[Hashable]
) -> int:
    return G.number_connected_components(subgraph_nodes)


# db


class ZoneContiguousNodes(BaseModel):
    zone: int
    nodes: list[str]


def get_assigned_nodes(
    session: Session,
    document_id: str,
    districtr_map: DistrictrMap,
    zones: list[int] | None = None,
    G: DualLevelGraph | None = None,
) -> list[ZoneContiguousNodes]:
    """Return assigned nodes that are individually contiguous.
    Parent nodes that are not contiguous will be expanded to block-level children.

    When G is provided, non-contiguous parent nodes are expanded to their
    block children via the graph.
    """
    binds: list[sa.BindParameter] = [sa.bindparam(key="document_id", type_=UUIDType)]
    params: dict[str, Any] = {"document_id": document_id}

    zone_filter = ""
    if zones is not None:
        zone_filter = "AND a.zone = ANY(:zones)"
        binds.append(sa.bindparam(key="zones", type_=ARRAY(Integer)))
        params["zones"] = zones

    sql = sa.text(f"""
        SELECT a.zone, array_agg(a.geo_id) AS nodes
        FROM document.assignments a
        WHERE a.document_id = :document_id
            AND a.zone IS NOT NULL
            {zone_filter}
        GROUP BY a.zone""").bindparams(*binds)

    results = []
    for row in session.execute(sql, params):
        if G:
            nodes = set(row.nodes)
            G.expand_non_contiguous(nodes)
            nodes = sorted(nodes)
        else:
            nodes = row.nodes
        results.append(ZoneContiguousNodes(zone=row.zone, nodes=nodes))
    return results


class NodeWithBBoxes(BaseModel):
    node: str
    xmin: float
    xmax: float
    ymin: float
    ymax: float


def get_assigned_nodes_bboxes(
    session: Session,
    document_id: str,
    districtr_map: DistrictrMap,
    zone: int,
    G: DualLevelGraph | None = None,
) -> list[NodeWithBBoxes] | None:
    """Return contiguous assigned nodes with bounding boxes for a specific zone.

    For shatterable maps (child_layer + parent_layer on districtr_map), unions both
    geometry-bearing base tables so each geo_id finds its geometry regardless of level.
    For non-shatterable maps, joins against gerrydb.{gerrydb_table_name} directly.

    When G is provided, non-contiguous parent nodes are expanded to their block
    children via the graph, so the result already contains block-level nodes
    and bboxes. Most views have no non-contiguous parents at all, so that case
    skips the Python round trip entirely and joins in one query — the two-step
    fetch-then-expand-then-requery shape only pays for itself when there's
    actually something to expand.
    """
    gerrydb_table_name = districtr_map.gerrydb_table_name
    child_layer = districtr_map.child_layer
    parent_layer = districtr_map.parent_layer

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

    if G and G._non_contiguous_parents:
        assigned = session.execute(
            sa.text("""
                SELECT a.geo_id
                FROM document.assignments a
                WHERE a.document_id = :document_id
                    AND a.zone = :zone
            """).bindparams(
                sa.bindparam(key="document_id", type_=UUIDType),
                sa.bindparam(key="zone", type_=Integer),
            ),
            {"document_id": document_id, "zone": zone},
        ).scalars()
        geo_ids_set = set(assigned)
        G.expand_non_contiguous(geo_ids_set)
        geo_ids = sorted(geo_ids_set)
        if not geo_ids:
            return None

        sql = sa.text(f"""SELECT
            g.path AS geo_id,
            st_xmin(Box2D(g.geometry)) AS xmin,
            st_xmax(Box2D(g.geometry)) AS xmax,
            st_ymin(Box2D(g.geometry)) AS ymin,
            st_ymax(Box2D(g.geometry)) AS ymax
        FROM {geo_source}
        WHERE g.path = ANY(:geo_ids)""").bindparams(
            sa.bindparam(key="geo_ids", type_=ARRAY(sa.String))
        )
        rows = session.execute(sql, {"geo_ids": geo_ids}).fetchall()
        if not rows:
            return None
    else:
        sql = sa.text(f"""SELECT
            ids.geo_id,
            st_xmin(Box2D(g.geometry)) AS xmin,
            st_xmax(Box2D(g.geometry)) AS xmax,
            st_ymin(Box2D(g.geometry)) AS ymin,
            st_ymax(Box2D(g.geometry)) AS ymax
        FROM (
            SELECT a.geo_id
            FROM document.assignments a
            WHERE a.document_id = :document_id
                AND a.zone IS NOT NULL
                AND a.zone = :zone
        ) ids
        JOIN {geo_source} ON g.path = ids.geo_id""").bindparams(
            sa.bindparam(key="document_id", type_=UUIDType),
            sa.bindparam(key="zone", type_=Integer),
        )
        rows = session.execute(
            sql, {"document_id": document_id, "zone": zone}
        ).fetchall()
        if not rows:
            return None

    return [
        NodeWithBBoxes(
            node=row.geo_id, xmin=row.xmin, xmax=row.xmax, ymin=row.ymin, ymax=row.ymax
        )
        for row in rows
    ]


def get_zone_connected_component_bboxes():
    pass
