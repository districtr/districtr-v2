"""Loads the sample documents used by
tests/test_metrics_gerrytools_validation.py directly into the DB,
bypassing the assignments API -- that test validates metrics' computation, not
the assignments endpoint.

Idempotent: a document already present (matched by its own document_id, taken
verbatim from prod_sample_documents.csv -- document.document.document_id has
no server-side default, so an explicit INSERT stores exactly the id given) is
left as-is. Safe to rerun after refreshing the sample CSVs; delete a
document's row from document.document first to force it to reload (its
assignments and district_unions rows both cascade on that).
"""

import csv
import logging
from pathlib import Path

from sqlalchemy import text
from sqlmodel import Session

logger = logging.getLogger(__name__)

COMPARABLE_STATE_PREFIXES = ("ga_", "mi_", "pa_", "tx_", "ny_")


def _document_exists(session: Session, document_id: str) -> bool:
    return (
        session.execute(
            text("SELECT 1 FROM document.document WHERE document_id = :d"),
            {"d": document_id},
        ).first()
        is not None
    )


def load_metrics_validation_documents(session: Session, data_dir: Path) -> None:
    documents_csv = data_dir / "prod_sample_documents.csv"
    assignments_csv = data_dir / "prod_sample_assignments.csv"

    with open(documents_csv) as f:
        documents = {
            row["document_id"]: row
            for row in csv.DictReader(f)
            if row["gerrydb_table_name"].startswith(COMPARABLE_STATE_PREFIXES)
        }

    to_load = {
        document_id: doc
        for document_id, doc in documents.items()
        if not _document_exists(session, document_id)
    }
    if not to_load:
        logger.info(
            "All %d comparable sample documents already loaded.", len(documents)
        )
        return

    assignments_by_doc: dict[str, list[tuple[str, int]]] = {
        document_id: [] for document_id in to_load
    }
    with open(assignments_csv) as f:
        for row in csv.DictReader(f):
            if row["document_id"] in to_load and row["zone"] != "":
                assignments_by_doc[row["document_id"]].append(
                    (row["geo_id"], int(row["zone"]))
                )

    for i, (document_id, doc) in enumerate(to_load.items(), 1):
        session.execute(
            text(
                "INSERT INTO document.document (document_id, districtr_map_slug) "
                "VALUES (:document_id, :slug)"
            ),
            {"document_id": document_id, "slug": doc["districtr_map_slug"]},
        )
        session.execute(
            text(
                "INSERT INTO document.assignments (document_id, geo_id, zone) "
                "VALUES (:document_id, :geo_id, :zone)"
            ),
            [
                {"document_id": document_id, "geo_id": geo_id, "zone": zone}
                for geo_id, zone in assignments_by_doc[document_id]
            ],
        )
        session.commit()
        logger.info(
            "[%d/%d] loaded %s (%s)",
            i,
            len(to_load),
            document_id,
            doc["districtr_map_slug"],
        )

    logger.info(
        "Loaded %d new documents (%d already present).",
        len(to_load),
        len(documents) - len(to_load),
    )
