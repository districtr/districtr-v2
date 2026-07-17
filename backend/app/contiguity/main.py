from typing import Iterable, Hashable, Any
from app.evaluation.district_graph import DistrictGraph
from app.models import UUIDType, DistrictrMap
from app.utils import assert_safe_ident
from sqlmodel import Session, Integer, ARRAY
from pydantic import BaseModel
import sqlalchemy as sa

import logging

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def check_subgraph_contiguity(
    G: DistrictGraph, subgraph_nodes: Iterable[Hashable]
) -> bool:
    return G.is_connected(subgraph_nodes)


def subgraph_number_connected_components(
    G: DistrictGraph, subgraph_nodes: Iterable[Hashable]
) -> int:
    return G.number_connected_components(subgraph_nodes)


def expand_non_contiguous_parents(G: DistrictGraph, nodes: Iterable[str]) -> set[str]:
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


class ZoneContiguousNodes(BaseModel):
    zone: int
    nodes: list[str]


def get_assigned_nodes(
    session: Session,
    document_id: str,
    districtr_map: DistrictrMap,
    zones: list[int] | None = None,
    G: DistrictGraph | None = None,
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

    return [
        ZoneContiguousNodes(
            zone=row.zone,
            nodes=(
                sorted(expand_non_contiguous_parents(G, row.nodes)) if G else row.nodes
            ),
        )
        for row in session.execute(sql, params)
    ]


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
    G: DistrictGraph | None = None,
) -> list[NodeWithBBoxes] | None:
    """Return contiguous assigned nodes with bounding boxes for a specific zone.

    For shatterable maps (child_layer + parent_layer on districtr_map), unions both
    geometry-bearing base tables so each geo_id finds its geometry regardless of level.
    For non-shatterable maps, joins against gerrydb.{gerrydb_table_name} directly.

    When G is provided, non-contiguous parent nodes are expanded to their block
    children via the graph, so the result already contains block-level nodes
    and bboxes.
    """
    gerrydb_table_name = districtr_map.gerrydb_table_name
    child_layer = districtr_map.child_layer
    parent_layer = districtr_map.parent_layer

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
    geo_ids = (
        sorted(expand_non_contiguous_parents(G, assigned)) if G else list(assigned)
    )
    if not geo_ids:
        return None

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

    return [
        NodeWithBBoxes(
            node=row.geo_id, xmin=row.xmin, xmax=row.xmax, ymin=row.ymin, ymax=row.ymax
        )
        for row in rows
    ]


def get_zone_connected_component_bboxes():
    pass
