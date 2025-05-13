from uuid import uuid4
from fastapi import Depends
from sqlalchemy.sql.functions import count
from app.core.db import get_session
from sqlalchemy import text
from sqlmodel import Session, select
from sqlalchemy.dialects.postgresql import insert
import logging
from sqlalchemy import literal
from app.models import (
    Assignments,
    DistrictrMap,
)
from collections import defaultdict

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def duplicate_document_assignments(
    from_document_id: str, to_document_id: str, session: Session = Depends(get_session)
) -> None:
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
        literal(to_document_id).label("document_id"),
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
        import_errors = 0
        null_count = 0
        for record in assignments:
            try:
                if record[1] and record[1] != "":
                    zone_val = zone_to_id[record[1]]
                    if (
                        districtr_map.num_districts is not None
                        and zone_val > districtr_map.num_districts
                    ):
                        raise ValueError("Too many unique zones provided")
                    copy.write_row([record[0], zone_val])
                else:
                    null_count += 1
            except ValueError:
                import_errors += 1

    logger.info(
        f"{import_errors} rows in the assignments provided failed to be written. {null_count} nulls were found"
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
        WHERE
            edges.parent_path = t.geo_id
            OR edges.child_path = t.geo_id"""

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

    return inserted_assignments
