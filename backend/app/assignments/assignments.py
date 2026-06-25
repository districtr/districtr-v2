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


def _is_whole_pos_number(s: str) -> bool:
    """True for positive integers without leading zeros (e.g. '2', '2.0') but not '01' or '1.5'."""
    if not s or s[0] == "0":
        return False
    try:
        n = float(s)
        return n > 0 and n == int(n)
    except ValueError:
        return False


def _build_zone_mapping(
    raw_zones: list[str], num_districts: int | None
) -> dict[str, int]:
    """Map raw zone strings to integer zone IDs.

    Whole-number strings (e.g. '2', '2.0') are parsed directly; all other non-empty
    strings (e.g. 'District 1', '01') are remapped to unused integer slots in
    [1, num_districts]. Raises ValueError if the total number of distinct zones
    exceeds num_districts.
    """
    seen: dict[str, int | None] = {}  # preserves insertion order, deduplicates
    for z in raw_zones:
        if z not in seen:
            seen[z] = None

    numeric_map: dict[str, int] = {}
    string_labels: list[str] = []
    for z in seen:
        if _is_whole_pos_number(z):
            numeric_map[z] = round(float(z))
        else:
            string_labels.append(z)

    used_ids = set(numeric_map.values())
    total_zones = len(used_ids) + len(string_labels)
    if num_districts is not None and total_zones > num_districts:
        raise ValueError(
            f"Too many zones: CSV contains {total_zones} distinct zones "
            f"but the map only has {num_districts} districts"
        )

    cap = num_districts or total_zones
    available = [i for i in range(1, cap + 1) if i not in used_ids][
        : len(string_labels)
    ]
    mapping = {**numeric_map, **dict(zip(string_labels, available))}
    return mapping


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


def _heal_or_fill(zone_by_geo: dict[str, int], G: Graph) -> dict[str, int | None]:
    """Heal uniform child assignments into their parent or fill unassigned siblings.

    Two operations run in a single pass over uploaded children:

    - **Heal**: if every child of a parent is uploaded with the same zone, collapse
      them into a single parent entry and remove the children.
    - **Fill**: if only some children of a parent are uploaded, insert the missing
      siblings with zone=None to uphold the shattered-parent contract.

    Returns a dict mapping geo_id → zone (int) or None.
    """
    children_assignments_by_parent: dict[str, dict[str, int]] = {}
    for geo_id, zone in zone_by_geo.items():
        node_data = G.nodes.get(geo_id)
        # Only import geoid in our map
        if node_data is None:
            continue
        # Only process child nodes
        if "parent" not in node_data:
            continue
        parent = node_data["parent"]
        children_assignments_by_parent.setdefault(parent, {})[geo_id] = zone

    to_remove: set[str] = set()
    healed: dict[str, int] = {}
    filled: dict[str, None] = {}
    for parent, children_assignments in children_assignments_by_parent.items():
        all_children: set[str] = G.nodes[parent]["children"]
        if children_assignments.keys() == all_children:
            zones = set(children_assignments.values())
            if len(zones) == 1:
                healed[parent] = zones.pop()
                to_remove.update(children_assignments)
        else:
            for child in all_children:
                if child not in children_assignments:
                    filled[child] = None

    result: dict[str, int | None] = {
        k: v for k, v in zone_by_geo.items() if k not in to_remove
    }
    result.update(healed)
    result.update(filled)
    return result


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
    valid_pairs: list[tuple[str, str]] = []
    seen_geo_ids: set[str] = set()
    num_districts = districtr_map.num_districts
    for record in assignments:
        raw_zone = record[1] if len(record) > 1 else ""
        if raw_zone and raw_zone != "":
            geo_id = record[0]
            if not geo_id or geo_id not in G:
                invalid_count += 1
                continue
            if geo_id in seen_geo_ids:
                raise DuplicateGeoIdError(geo_id)
            seen_geo_ids.add(geo_id)
            valid_pairs.append((geo_id, raw_zone))
        else:
            null_count += 1

    logger.info(
        f"{null_count} unassigned rows skipped, {invalid_count} invalid geo_ids skipped"
    )

    zone_mapping = _build_zone_mapping([z for _, z in valid_pairs], num_districts)
    zone_by_geo_int: dict[str, int] = {}
    for geo_id, raw_zone in valid_pairs:
        zone = zone_mapping.get(raw_zone)
        if zone is None or not 0 < zone <= (num_districts or zone):
            invalid_count += 1
            continue
        zone_by_geo_int[geo_id] = zone

    if districtr_map.child_layer is not None:
        zone_by_geo: dict[str, int | None] = _heal_or_fill(zone_by_geo_int, G)
    else:
        zone_by_geo = zone_by_geo_int

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
