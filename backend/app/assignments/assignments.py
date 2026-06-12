from uuid import uuid4
from fastapi import Depends
from sqlalchemy.sql.functions import count
from app.core.db import get_session
from sqlalchemy import cast, literal, text, Column, String, Integer, MetaData, Table
from sqlmodel import Session, select
from sqlalchemy.dialects.postgresql import insert, UUID as PG_UUID
import logging
from networkx import Graph
from app.models import (
    Assignments,
    CommunityAssignments,
    DistrictrMap,
)
from app.core.config import settings
from app.evaluation.graph import get_graph

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)
VERBOSE_LOGGING = settings.VERBOSE_LOGGING


class DuplicateGeoIdError(ValueError):
    pass


def duplicate_document_assignments(
    from_document_id: str, to_document_id: str, session: Session = Depends(get_session)
) -> int | None:
    """
    Copy all assignments from `from_document_id` to another document, `to_document_id`.

    Does not check if the receiving document is empty. Will fail if conflicting geo_ids
    are inserted into the receiving document.

    Args:
        from_document_id (str): Document from which assignments should be copied.
        to_document_id (str): Document to which assignments should be copied.
        session (Session): Optional database session. This function is to be used typically
            by a higher level interface and executed within its session.

    Returns:
        int | None: The number of assignments inserted into the receiving document, or
        None if the operation failed.
    """
    prev_assignments = select(Assignments).where(
        Assignments.document_id == from_document_id
    )
    prev_assignments = select(
        Assignments.geo_id,
        Assignments.zone,
        cast(literal(to_document_id), PG_UUID).label("document_id"),
    ).where(Assignments.document_id == from_document_id)

    create_copy_stmt = insert(Assignments).from_select(
        ["geo_id", "zone", "document_id"], prev_assignments
    )
    session.connection().execute(create_copy_stmt)

    inserted_assignments = session.exec(
        select(count()).where(Assignments.document_id == to_document_id)
    ).one()
    logger.info(
        f"Inserted {inserted_assignments} assignments to document `{to_document_id}`"
    )
    return inserted_assignments


def duplicate_document_community_assignments(
    from_document_id: str, to_document_id: str, session: Session = Depends(get_session)
) -> int | None:
    """
    Copy all community assignments from `from_document_id` to `to_document_id`.

    Community assignments can overlap on `geo_id`, so uniqueness is enforced on the
    tuple `(document_id, community_id, geo_id)`.

    Args:
        from_document_id (str): Document from which community assignments should be copied.
        to_document_id (str): Document to which community assignments should be copied.
        session (Session): Optional database session. This function is to be used typically
            by a higher level interface and executed within its session.

    Regturns:
        int | None: The number of community assignments inserted into the receiving document, or
        None if the operation failed.
    """
    prev_assignments = select(
        CommunityAssignments.geo_id,
        CommunityAssignments.community_id,
        cast(literal(to_document_id), PG_UUID).label("document_id"),
    ).where(CommunityAssignments.document_id == from_document_id)

    create_copy_stmt = insert(CommunityAssignments).from_select(
        ["geo_id", "community_id", "document_id"], prev_assignments
    )
    session.connection().execute(create_copy_stmt)

    inserted_assignments = session.exec(
        select(count()).where(CommunityAssignments.document_id == to_document_id)
    ).one()
    if VERBOSE_LOGGING:
        logger.info(
            f"Inserted {inserted_assignments} community assignments to document `{to_document_id}`"
        )
    return inserted_assignments


def _heal_with_graph(zone_by_geo: dict[str, int], G: Graph) -> dict[str, int]:
    """Replace uniform child-block assignments with their parent zone.

    A parent is healed when every one of its children is present in zone_by_geo
    and they all agree on the same zone. Healed children are removed and replaced
    by a single parent entry.

    Iterates over uploaded rows only (not all graph nodes) for O(N) performance.
    """
    # Group uploaded children by their parent
    uploaded_by_parent: dict[str, dict[str, int]] = {}
    for geo_id, zone in zone_by_geo.items():
        node_data = G.nodes.get(geo_id)
        if node_data is None:
            continue
        parent = node_data.get("parent")
        if parent is None:
            continue
        uploaded_by_parent.setdefault(parent, {})[geo_id] = zone

    to_remove: set[str] = set()
    healed: dict[str, int] = {}
    for parent, uploaded_children in uploaded_by_parent.items():
        all_children: set[str] = G.nodes[parent].get("children", set())
        if uploaded_children.keys() != all_children:
            continue
        zones = set(uploaded_children.values())
        if len(zones) == 1:
            healed[parent] = zones.pop()
            to_remove.update(uploaded_children)

    return {k: v for k, v in zone_by_geo.items() if k not in to_remove} | healed


def batch_insert_assignments(
    document_id: str,
    assignments: list[list[str]],
    districtr_map_slug: str,
    session: Session = Depends(get_session),
) -> int | None:
    """
    Insert assignments into the document, `document_id`, healing assignments into
    partent assignments where possible if all children are assigned to the same zone.

    Only assignments with geo_ids that are valid for the provided `districtr_map_slug`
    will be inserted.

    Args:
        document_id: Document id of the document assignments should be inserted into.
        assignments: Assignments to be inserted.
        districtr_map_slug: Districtr map slug that the document belongs to.
        session (Session): Optional database session. This function is to be used typically
            by a higher level interface and executed within its session.
    """
    districtr_map = session.exec(
        select(DistrictrMap).where(
            DistrictrMap.districtr_map_slug == districtr_map_slug
        )
    ).one()

    G = get_graph(districtr_map.gerrydb_table_name)

    null_count = 0
    invalid_count = 0
    zone_by_geo: dict[str, int] = {}
    num_districts = districtr_map.num_districts
    for record in assignments:
        if record[1] and record[1] != "":
            geo_id = record[0]
            zone = int(record[1])  # ValueError propagates for non-integer zones
            if not geo_id or geo_id not in G or not 0 < zone <= (num_districts or zone):
                invalid_count += 1
                continue
            if geo_id in zone_by_geo:
                raise DuplicateGeoIdError(geo_id)
            zone_by_geo[geo_id] = zone
        else:
            null_count += 1

    logger.info(
        f"{null_count} unassigned rows skipped, {invalid_count} invalid geo_ids/zones skipped"
    )

    if districtr_map.child_layer is not None:
        zone_by_geo = _heal_with_graph(zone_by_geo, G)

    load_id, _ = str(uuid4()).split("-", maxsplit=1)
    temp_table = f"temp_assignments_{load_id}"

    session.connection().execute(
        text(f"CREATE TEMP TABLE {temp_table} (geo_id TEXT, zone INT) ON COMMIT DROP")
    )
    cursor = session.connection().connection.cursor()
    with cursor.copy(f"COPY {temp_table} (geo_id, zone) FROM STDIN") as copy:
        for geo_id, zone in zone_by_geo.items():
            copy.write_row([geo_id, zone])

    temp = Table(
        temp_table, MetaData(), Column("geo_id", String), Column("zone", Integer)
    )
    session.connection().execute(
        insert(Assignments).from_select(
            ["geo_id", "zone", "document_id"],
            select(temp.c.geo_id, temp.c.zone, cast(literal(document_id), PG_UUID)),
        )
    )
    inserted = len(zone_by_geo)
    logger.info(f"Inserted {inserted} assignments to document `{document_id}`")

    return inserted
