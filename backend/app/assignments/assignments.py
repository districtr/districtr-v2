from uuid import uuid4
from fastapi import Depends
from sqlalchemy.sql.functions import count
from app.core.db import get_session
from sqlalchemy import text, cast
from sqlmodel import Session, select
from sqlalchemy.dialects.postgresql import insert, UUID as PG_UUID
import logging
from sqlalchemy import literal
from app.models import (
    Assignments,
    DistrictrMap,
)
from collections import defaultdict
from dataclasses import dataclass

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


@dataclass
class AssignmentInsertResult:
    inserted_assignments: int
    total_rows: int
    null_zone_rows: int
    invalid_zone_rows: int
    invalid_geoid_rows: int
    empty_geoid_rows: int


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
    session.execute(create_copy_stmt)

    inserted_assignments = session.execute(
        select(count()).where(Assignments.document_id == to_document_id)
    ).scalar()
    logger.info(
        f"Inserted {inserted_assignments} assignments to document `{to_document_id}`"
    )
    return inserted_assignments


def batch_insert_assignments(
    document_id: str,
    assignments: list[list[str]],
    districtr_map_slug: str,
    session: Session = Depends(get_session),
) -> AssignmentInsertResult:
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
    stmt = select(DistrictrMap).where(
        DistrictrMap.districtr_map_slug == districtr_map_slug
    )
    districtr_map = session.exec(stmt).one()

    (load_id, _) = str(uuid4()).split("-", maxsplit=1)
    temp_table_name = f"temp_assignments_{load_id}"

    session.execute(
        text(f"CREATE TEMP TABLE {temp_table_name} (geo_id TEXT, zone INT)")
    )

    def _get_next_id():
        counter = 1
        while True:
            yield counter
            counter += 1

    id_generator = _get_next_id()
    zone_to_id = defaultdict(lambda: next(id_generator))

    cursor = session.connection().connection.cursor()
    with cursor.copy(f"COPY {temp_table_name} (geo_id, zone) FROM STDIN") as copy:
        null_count = 0
        invalid_zone_rows = 0
        empty_geoid_rows = 0
        total_rows = len(assignments)
        for record in assignments:
            if not isinstance(record, (list, tuple)) or len(record) < 2:
                invalid_zone_rows += 1
                continue

            geo_id = (
                str(record[0]).strip()
                if record[0] is not None and str(record[0]).strip() != ""
                else ""
            )
            if not geo_id:
                empty_geoid_rows += 1
                continue

            zone_value = record[1]
            if zone_value is None or str(zone_value).strip() == "":
                null_count += 1
                continue

            zone_key = str(zone_value).strip()
            zone_val = zone_to_id[zone_key]
            if (
                districtr_map.num_districts is not None
                and zone_val > districtr_map.num_districts
            ):
                invalid_zone_rows += 1
                continue
            copy.write_row([geo_id, zone_val])

    logger.info(
        f"{invalid_zone_rows} rows had invalid zones. "
        f"{empty_geoid_rows} rows had empty geo_ids. "
        f"{null_count} rows had null zones."
    )

    # Default check against valid geoids
    exists_clause = f"""
    SELECT 1
    FROM gerrydb."{districtr_map.parent_layer}" g
    WHERE
        g.path = t.geo_id"""

    # Shattered map
    if districtr_map.child_layer is not None:
        parent_child_table = f'"parentchildedges_{districtr_map.uuid}"'

        exists_clause = f"""
        SELECT 1
        FROM {parent_child_table} edges
        WHERE (edges.districtr_map = '{districtr_map.uuid}') AND
            (edges.parent_path = t.geo_id
            OR edges.child_path = t.geo_id)"""

        # Using a temp index can improve performance for large datasets
        session.execute(
            text(
                f"CREATE INDEX IF NOT EXISTS temptable_geo_id_idx_{load_id} ON {temp_table_name} (geo_id)"
            )
        )

        # All children belonging to a single parent which share a zone can be healed
        # to the parent if all parent children are accounted for
        uniform_vtds = f"uniform_vtds_{load_id}"
        session.execute(
            text(f"""
            CREATE TEMPORARY TABLE {uniform_vtds} AS
            SELECT
                parent_path,
                MIN(zone) AS zone
            FROM
                {parent_child_table}
            LEFT JOIN
                {temp_table_name} ON geo_id = {parent_child_table}.child_path
            GROUP BY
                parent_path
            HAVING
                COUNT(DISTINCT COALESCE(zone, -1)) = 1
                AND COUNT(parent_path) = COUNT(*) FILTER (WHERE zone IS NOT NULL)
        """)
        )

        session.execute(
            text(f"""
            INSERT INTO {temp_table_name} (geo_id, zone)
            SELECT parent_path, zone FROM {uniform_vtds}
        """)
        )

        session.execute(
            text(f"""
            DELETE FROM {temp_table_name}
            WHERE geo_id IN (
                SELECT child_path FROM {parent_child_table}
                WHERE parent_path IN (
                    SELECT parent_path FROM {uniform_vtds}
                )
            )
        """)
        )
        # For non-shatterable maps, we don't need additional validation
        # as the geo_ids should match the gerrydb table directly

    invalid_geoid_rows = session.execute(
        text(f"""
        SELECT COUNT(*)
        FROM {temp_table_name} t
        WHERE NOT EXISTS (
            {exists_clause}
        )
        """)
    ).scalar()

    inserted_assignments = session.execute(
        text(f"""
        WITH inserted_geoids AS (
            INSERT INTO document.assignments (geo_id, zone, document_id)
            SELECT geo_id, zone, :document_id
            FROM {temp_table_name} t
            WHERE EXISTS (
                {exists_clause}
            )
            RETURNING *
        )
        SELECT COUNT(*) FROM inserted_geoids
        """),
        {"document_id": document_id},
    ).scalar()
    logger.info(
        f"Inserted {inserted_assignments} assignments to document `{document_id}`"
    )

    return AssignmentInsertResult(
        inserted_assignments=inserted_assignments or 0,
        total_rows=total_rows,
        null_zone_rows=null_count,
        invalid_zone_rows=invalid_zone_rows,
        invalid_geoid_rows=invalid_geoid_rows or 0,
        empty_geoid_rows=empty_geoid_rows,
    )
