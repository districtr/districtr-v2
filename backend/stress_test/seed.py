"""Seed + cleanup logic for the production stress test (STRESS_TEST_PLAN.md §5 WS2).

Called by the `stress-test-seed` / `stress-test-cleanup` commands in
backend/cli.py, which run inside a backend task (local docker-compose, or prod
via ECS Exec — see README.md). Seeding goes over HTTP (POST
/api/create_document + PUT /api/assignments) so seed documents are created
exactly as the app creates them; the DB session is used only to validate
config slugs against the districtrmap table and, for cleanup, to delete
documents and their assignment partitions (the partition drop mirrors
PATCH /api/assignments/{id}/reset, app/main.py:1085, minus the recreate).
"""

import json
import logging
from urllib.parse import urlparse
from uuid import UUID

import msgpack
import requests
from sqlalchemy import text
from sqlmodel import Session

from app.core.config import settings as app_settings
from stress_test.config import (
    _read_url_or_file,
    load_config_rows,
    resolve_assignments_path,
)

logger = logging.getLogger(__name__)

NAME_PREFIX = "[STRESS-TEST]"


def write_manifest(path: str, payload: dict) -> None:
    """Write the manifest locally or to an s3:// URI (prod seeding runs in an
    ephemeral Fargate task, so the manifest must outlive it)."""
    body = json.dumps(payload, indent=2)
    if path.startswith("s3://"):
        url = urlparse(path)
        s3 = app_settings.get_s3_client()
        assert s3, "S3 client is not available"
        s3.put_object(Bucket=url.netloc, Key=url.path.lstrip("/"), Body=body.encode())
    else:
        with open(path, "w") as f:
            f.write(body)


def seed_documents(
    session: Session,
    base_url: str,
    config_url: str,
    run_id: str,
    manifest_path: str,
) -> list[dict]:
    """Create one seed document per stress-test config row and write the seed
    manifest the locustfile reads: {run_id, documents: [{document_id,
    districtr_map_slug, use}]}."""
    rows = load_config_rows(config_url)
    known_slugs = set(
        session.scalars(text("SELECT districtr_map_slug FROM districtrmap")).all()
    )
    missing = [
        row["districtr_map_slug"]
        for row in rows
        if row["districtr_map_slug"] not in known_slugs
    ]
    if missing:
        raise ValueError(
            f"Config slugs not found in the districtrmap table: {missing}. "
            "Seeding nothing rather than a partial set."
        )

    headers = {"User-Agent": f"districtr-stress-test/{run_id}"}
    documents: list[dict] = []
    for row in rows:
        slug = row["districtr_map_slug"]
        assignments = msgpack.unpackb(
            _read_url_or_file(
                resolve_assignments_path(row["assignments_path"], config_url)
            ),
            raw=False,
        )
        resp = requests.post(
            f"{base_url}/api/create_document",
            json={
                "districtr_map_slug": slug,
                "metadata": {"name": f"{NAME_PREFIX} {run_id} seed {slug}"},
            },
            headers=headers,
        )
        resp.raise_for_status()
        doc = resp.json()
        save = requests.put(
            f"{base_url}/api/assignments",
            data=msgpack.packb(
                {
                    "document_id": doc["document_id"],
                    "assignments": assignments,
                    "last_updated_at": doc["updated_at"],
                }
            ),
            headers={**headers, "Content-Type": "application/msgpack"},
        )
        save.raise_for_status()
        documents.append(
            {
                "document_id": doc["document_id"],
                "districtr_map_slug": slug,
                "use": row["use"],
            }
        )
        # Write-through: a mid-seed failure still leaves a manifest of
        # everything created so far.
        write_manifest(manifest_path, {"run_id": run_id, "documents": documents})
        logger.info(
            "Seeded %s: %s (%d assignments)", slug, doc["document_id"], len(assignments)
        )
    logger.info("Wrote %s (%d documents)", manifest_path, len(documents))
    return documents


def manifest_document_ids(path: str) -> list[str]:
    """Extract document ids from either manifest shape: the seed manifest
    ({documents: [{document_id, ...}]}) or the harness runtime manifest
    ({created_documents: [uuid, ...]})."""
    with open(path) as f:
        data = json.load(f)
    return [doc["document_id"] for doc in data.get("documents", [])] + list(
        data.get("created_documents", [])
    )


def find_stress_documents(session: Session) -> list[tuple[str, str]]:
    """(document_id, name) of every document whose metadata name starts with
    NAME_PREFIX — belt-and-suspenders sweep for anything the manifests missed."""
    rows = session.execute(
        text(
            """SELECT document_id::text, map_metadata->>'name'
            FROM document.document
            WHERE map_metadata->>'name' LIKE :prefix"""
        ),
        {"prefix": f"{NAME_PREFIX}%"},
    ).all()
    return [(row[0], row[1]) for row in rows]


def delete_documents(session: Session, document_ids: list[str]) -> int:
    """Fully delete documents: drop their assignments/community_assignments
    partitions (as the reset endpoint does), delete dependent rows, then the
    document rows themselves (document.evaluation cascades via FK). Ids not in
    the DB are no-ops. Commits per chunk to keep the DDL lock count per
    transaction small. Returns the number of document rows deleted."""
    ids = [str(UUID(d)) for d in document_ids]  # validate before f-string DDL
    deleted = 0
    chunk_size = 50
    for start in range(0, len(ids), chunk_size):
        chunk = ids[start : start + chunk_size]
        conn = session.connection()
        for document_id in chunk:
            for table in ("assignments", "community_assignments"):
                conn.execute(
                    text(
                        f'DROP TABLE IF EXISTS "document.{table}_{document_id}" CASCADE'
                    )
                )
        params = {"ids": chunk}
        id_filter = "document_id = ANY(CAST(:ids AS uuid[]))"
        conn.execute(
            text(
                f"""WITH removed AS (
                    DELETE FROM comments.document_comment WHERE {id_filter}
                    RETURNING comment_id
                )
                DELETE FROM comments.comment
                WHERE id IN (SELECT comment_id FROM removed)"""
            ),
            params,
        )
        for table in (
            "document.district_unions",
            "document.map_document_user_session",
            "document.map_document_token",
        ):
            conn.execute(text(f"DELETE FROM {table} WHERE {id_filter}"), params)
        result = conn.execute(
            text(f"DELETE FROM document.document WHERE {id_filter}"), params
        )
        deleted += result.rowcount
        session.commit()
    if ids:
        logger.info("Deleted %d of %d listed documents", deleted, len(ids))
    return deleted
