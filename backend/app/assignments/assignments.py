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

    temp_table_name = "temp_assignments"

    session.execute(
        text(f"CREATE TEMP TABLE {temp_table_name} (geo_id TEXT, zone INT)")
    )

    cursor = session.connection().connection.cursor()
    with cursor.copy(f"COPY {temp_table_name} (geo_id, zone) FROM STDIN") as copy:
        import_errors = 0
        for record in assignments:
            try:
                if not record[1] or record[1] == "":
                    copy.write_row([record[0], None])
                else:
                    zone_val = int(record[1])
                    copy.write_row([record[0], zone_val])
            except ValueError:
                import_errors += 1

    logger.info(
        f"{import_errors} rows in the assignments provided failed to be written"
    )

    parent_child_table = f'"parentchildedges_{districtr_map.uuid}"'

    # Shattered map
    if districtr_map.child_layer is not None:
        # Using a temp index can improve performance for large datasets
        session.execute(
            text(
                f"CREATE INDEX IF NOT EXISTS temptable_geo_id_idx ON {temp_table_name} (geo_id)"
            )
        )

        # All children belonging to a single part which share a zone can be healed
        # to the parent
        session.execute(
            text(f"""
            CREATE TEMPORARY TABLE uniform_vtds AS
            SELECT parent_path, MIN(zone) AS zone
            FROM {parent_child_table}
            JOIN {temp_table_name} ON geo_id = {parent_child_table}.child_path
            GROUP BY parent_path
            HAVING COUNT(DISTINCT COALESCE(zone, -1)) = 1
        """)
        )

        session.execute(
            text(f"""
            INSERT INTO {temp_table_name} (geo_id, zone)
            SELECT parent_path, zone FROM uniform_vtds
        """)
        )

        session.execute(
            text(f"""
            DELETE FROM {temp_table_name}
            WHERE geo_id IN (
                SELECT child_path FROM {parent_child_table}
                WHERE parent_path IN (
                    SELECT parent_path FROM uniform_vtds
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
                SELECT 1
                FROM {parent_child_table} edges
                WHERE
                    edges.parent_path = t.geo_id
                    OR edges.child_path = t.geo_id
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
