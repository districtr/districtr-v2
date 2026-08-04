from dataclasses import dataclass, field
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


# Same global bound as the metadata endpoint's num_districts validation.
MAX_DISTRICTS = 538

# A numeric zone label is treated as accidental (and remapped) when it exceeds
# OUTLIER_FACTOR times the plan's reference label — see _detect_outlier_labels.
OUTLIER_FACTOR = 5
MAX_OUTLIERS = 2


@dataclass
class BatchInsertResult:
    inserted: int
    skipped_geo_ids: list[str] = field(default_factory=list)
    zone_label_remapping: dict[str, int] = field(default_factory=dict)
    # Highest zone id actually assigned; drives the document's num_districts
    # on maps with num_districts_modifiable.
    max_assigned_zone: int | None = None


def _is_whole_pos_number(s: str) -> bool:
    """True for positive integers without leading zeros (e.g. '2', '2.0') but not '01' or '1.5'."""
    if not s or s[0] == "0":
        return False
    try:
        n = float(s)
        return n > 0 and n == int(n)
    except ValueError:
        return False


def _detect_outlier_labels(raw_zones: set[str], default_num_districts: int) -> set[str]:
    """Numeric zone labels that are almost certainly accidental, e.g. '196' in
    a plan whose other labels are 1..10.

    User labels carry meaning, so this is deliberately conservative. Only the
    MAX_OUTLIERS largest labels can be flagged, and each only when it exceeds
    OUTLIER_FACTOR times a reference: the larger of the next-largest remaining
    label and the map's default district count. Anchoring the reference on the
    next-largest label means that when three or more labels are similarly
    large, the plan's labels are genuinely spread out and nothing is flagged.
    """
    numeric = sorted(
        {round(float(z)) for z in raw_zones if _is_whole_pos_number(z)}, reverse=True
    )
    reference = max(
        numeric[MAX_OUTLIERS] if len(numeric) > MAX_OUTLIERS else 0,
        default_num_districts,
    )
    cutoff = OUTLIER_FACTOR * reference
    outlier_values = {n for n in numeric[:MAX_OUTLIERS] if n > cutoff}
    return {
        z
        for z in raw_zones
        if _is_whole_pos_number(z) and round(float(z)) in outlier_values
    }


def _build_zone_mapping(
    raw_zones: set[str], zone_cap: int, outlier_reference: int | None = None
) -> tuple[dict[str, int], set[str]]:
    """Map raw zone strings to integer zone IDs.

    Whole-number strings (e.g. '2', '2.0') are parsed directly; all other
    strings (e.g. 'District 1', '01') and numbers above zone_cap (e.g. '5' with
    a cap of 3) are remapped to unused integer slots in [1, zone_cap].
    Raises ValueError if the total number of distinct zones exceeds zone_cap.

    When outlier_reference is given (the map's default district count, on
    modifiable maps where labels drive the document's district count), numeric
    labels flagged by _detect_outlier_labels are remapped like non-numeric ones.

    Returns:
        (mapping, remapped_keys) where remapped_keys is the set of labels that
        were assigned a new slot — non-numeric strings, empty string,
        above-cap numbers, and detected outliers.
    """
    outliers: set[str] = set()
    if outlier_reference is not None:
        outliers = _detect_outlier_labels(raw_zones, outlier_reference)

    numeric_map: dict[str, int] = {}
    string_labels: list[str] = []
    for z in raw_zones:
        if _is_whole_pos_number(z) and z not in outliers:
            n = round(float(z))
            if n <= zone_cap:
                numeric_map[z] = n
            else:
                string_labels.append(z)
        else:
            string_labels.append(z)

    used_ids = set(numeric_map.values())
    total_zones = len(used_ids) + len(string_labels)
    if total_zones > zone_cap:
        raise ValueError(
            f"Too many districts: CSV contains {total_zones} distinct districts "
            f"but the map only has {zone_cap} districts"
        )

    available = [i for i in range(1, zone_cap + 1) if i not in used_ids][
        : len(string_labels)
    ]
    mapping = {**numeric_map, **dict(zip(string_labels, available))}
    return mapping, set(string_labels)


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
) -> BatchInsertResult:
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

    if districtr_map.num_districts_modifiable:
        # The uploaded plan drives the district count, so distinct zones are
        # capped only by the global bound rather than the map's default.
        zone_cap = MAX_DISTRICTS
    elif districtr_map.num_districts is None:
        # Broken map row: a fixed-district map without a district count can
        # neither bound nor display zones. RuntimeError (not ValueError) so it
        # surfaces as a 500 rather than being blamed on the upload.
        raise RuntimeError(
            f"Data issue: map {districtr_map.districtr_map_slug!r} has "
            "num_districts_modifiable=False but num_districts is NULL"
        )
    else:
        zone_cap = districtr_map.num_districts

    raw_zones: set[str] = set()
    for record in assignments:
        raw_zones.add(record[1])

    zone_mapping, remapped_keys = _build_zone_mapping(
        raw_zones,
        zone_cap,
        # Only modifiable maps grow their district count from labels, so only
        # they are exposed to accidental labels inflating it (e.g. '196').
        outlier_reference=(
            (districtr_map.num_districts or 2)
            if districtr_map.num_districts_modifiable
            else None
        ),
    )

    skipped_geo_ids: list[str] = []
    seen_geo_ids: set[str] = set()
    zone_by_geo_int: dict[str, int] = {}
    for record in assignments:
        geo_id = record[0]
        if not geo_id or geo_id not in G:
            if geo_id:
                skipped_geo_ids.append(geo_id)
            continue
        if geo_id in seen_geo_ids:
            raise DuplicateGeoIdError(geo_id)
        seen_geo_ids.add(geo_id)
        zone_by_geo_int[geo_id] = zone_mapping[record[1]]

    if skipped_geo_ids:
        logger.info(
            "%d geo_ids not found in map graph and skipped", len(skipped_geo_ids)
        )

    # Remapped labels that had at least one valid geo_id: sub-dict of zone_mapping
    # restricted to remapped_keys (non-numeric, out-of-bounds, empty string) whose
    # assigned zone actually appears in the validated assignments.
    valid_zone_ids: set[int] = set(zone_by_geo_int.values())
    zone_label_remapping: dict[str, int] = {
        k: zone_mapping[k] for k in remapped_keys if zone_mapping[k] in valid_zone_ids
    }

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

    return BatchInsertResult(
        inserted=inserted,
        skipped_geo_ids=skipped_geo_ids,
        zone_label_remapping=zone_label_remapping,
        max_assigned_zone=max(valid_zone_ids, default=None),
    )
