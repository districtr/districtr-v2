from fastapi import (
    status,
    Depends,
    HTTPException,
    APIRouter,
    BackgroundTasks,
)
from typing import Annotated
from sqlalchemy import text, bindparam
from sqlalchemy.exc import NoResultFound
from sqlmodel import Session, String
from time import time
import logging
from app.core.db import get_session
from app.core.dependencies import (
    get_document,
    get_protected_document,
    get_document_public,
    parse_document_id,
)
from app.models import (
    Document,
)
from app.save_share.locks import check_map_lock
from app.core.config import settings
import jwt
from app.core.models import UUIDType
from app.save_share.models import (
    DocumentCheckoutRequest,
    DocumentShareStatus,
    DocumentEditStatus,
    DocumentDraftStatus,
    UserID,
    DocumentShareRequest,
    DocumentShareResponse,
)
from app.thumbnails.main import generate_thumbnail, THUMBNAIL_BUCKET
import bcrypt
from datetime import datetime


logging.getLogger("sqlalchemy").setLevel(logging.ERROR)
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


router = APIRouter(tags=["save_share"])


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))


def update_district_unions(
    session: Session,
    map_info: tuple[str, str, datetime],
    background_tasks: BackgroundTasks,
) -> None:
    """
    Update the district_unions materialized view for a document by creating
    unions of geometries grouped by zone, with demographic data aggregation.

    Args:
        session: The database session
        map_info: A tuple containing the document_id, gerrydb_table, updated_at
    """
    document_id, gerrydb_table, updated_at = map_info
    time0 = time()
    try:
        document_id_str = str(document_id)
        # First, create a partition for this document if it doesn't exist
        partition_name = f"district_unions_{document_id_str.replace('-', '_')}"
        session.execute(
            text(f"""
                CREATE TABLE IF NOT EXISTS document.{partition_name} 
                PARTITION OF document.district_unions 
                FOR VALUES IN ('{document_id_str}')
            """)
        )

        last_updated_union = session.execute(
            text("""
                SELECT updated_at
                FROM document.district_unions
                WHERE document_id = :document_id
                LIMIT 1
            """),
            {"document_id": document_id, "updated_at": updated_at},
        ).one_or_none()

        if last_updated_union and last_updated_union.updated_at >= updated_at:
            logger.info(
                f"District unions for document {document_id} have already been updated"
            )
            return

        # Clear existing data for this document
        session.execute(
            text(
                "DELETE FROM document.district_unions WHERE document_id = :document_id"
            ),
            {"document_id": document_id},
        )
        if gerrydb_table:
            # Get column names from gerrydb table (excluding geometry and fid)
            # that are numeric
            column_info = session.execute(
                text("""
                    SELECT 
                        a.attname as column_name
                    FROM pg_attribute a
                    JOIN pg_class t on a.attrelid = t.oid
                    JOIN pg_namespace s on t.relnamespace = s.oid
                    WHERE a.attnum > 0 
                        AND NOT a.attisdropped
                        AND t.relname = :mvname
                        AND s.nspname = 'gerrydb'
                        AND a.attname not in ('geometry', 'fid', 'path')
                        AND pg_catalog.format_type(a.atttypid, a.atttypmod) in (
                            'double precision',
                            'integer',
                            'smallint',
                            'bigint',
                            'decimal',
                            'numeric',
                            'real',
                            'smallserial',
                            'bigserial',
                            'serial'
                        )
                    ORDER BY a.attnum;
                """),
                {"mvname": gerrydb_table},
            ).fetchall()

            if column_info:
                # Build dynamic sum columns for demographic data
                demographic_columns = [col.column_name for col in column_info]
                # Build JSON object for demographic data
                json_pairs = [
                    f"'{col}', SUM(demo.{col})" for col in demographic_columns
                ]
                demographic_json = f"json_build_object({', '.join(json_pairs)})"

                # Enhanced query with demographic data
                query = f"""
                INSERT INTO document.district_unions (document_id, zone, geometry, demographic_data, created_at, updated_at)
                WITH geos AS ( 
                    SELECT * FROM get_zone_assignments_geo(:document_id) 
                )
                SELECT 
                    :document_id as document_id,
                    geos.zone::INTEGER as zone,
                    ST_Multi(ST_Transform(ST_Union(geos.geometry), 4326)) as geometry,
                    {demographic_json} as demographic_data,
                    NOW() as created_at,
                    NOW() as updated_at
                FROM geos
                INNER JOIN gerrydb.{gerrydb_table} demo ON demo.path = geos.geo_id
                WHERE geos.zone IS NOT NULL
                GROUP BY geos.zone
                """
            else:
                # No demographic columns found, fall back to basic query
                logger.warning(
                    f"No numeric demographic columns found in {gerrydb_table}"
                )
                query = """
                INSERT INTO document.district_unions (document_id, zone, geometry, created_at, updated_at)
                WITH geos AS ( 
                    SELECT * FROM get_zone_assignments_geo(:document_id) 
                )
                SELECT 
                    :document_id as document_id,
                    zone::INTEGER as zone,
                    ST_Multi(ST_Transform(ST_Union(geometry), 4326)) as geometry,
                    NOW() as created_at,
                    NOW() as updated_at
                FROM geos
                WHERE zone IS NOT NULL
                GROUP BY zone
                """
        else:
            # No gerrydb_table, use basic query
            query = """
            INSERT INTO document.district_unions (document_id, zone, geometry, created_at, updated_at)
            WITH geos AS ( 
                SELECT * FROM get_zone_assignments_geo(:document_id) 
            )
            SELECT 
                :document_id as document_id,
                zone::INTEGER as zone,
                ST_Multi(ST_Transform(ST_Union(geometry), 4326)) as geometry,
                NOW() as created_at,
                NOW() as updated_at
            FROM geos
            WHERE zone IS NOT NULL
            GROUP BY zone
            """

        session.execute(text(query), {"document_id": document_id})
        session.commit()
        background_tasks.add_task(
            generate_thumbnail,
            session=session,
            document_id=document_id,
            out_directory=THUMBNAIL_BUCKET,
        )

        logger.info(
            f"Updated district unions for document {document_id} in {time() - time0} seconds"
        )

    except Exception as e:
        session.rollback()
        logger.error(
            f"Failed to update district unions for document {document_id}: {str(e)}"
        )
        raise


def bulk_update_district_stats(
    session: Session, document_ids: list[str], background_tasks: BackgroundTasks
) -> None:
    """
    Bulk update the district unions for a list of documents.
    """
    logger.info(f"Bulk updating district unions for documents {document_ids}")
    map_documents_to_update = []
    try:
        for document_id in document_ids:
            document = get_document_public(session, parse_document_id(document_id))
            ready_to_share = (
                document.map_metadata
                and document.map_metadata.get("draft_status")
                == DocumentDraftStatus.ready_to_share.value
            )
            if ready_to_share:
                map_documents_to_update.append(
                    (document_id, document.gerrydb_table, document.updated_at)
                )
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    for map_info in map_documents_to_update:
        background_tasks.add_task(
            update_district_unions, session, map_info, background_tasks
        )


@router.post("/api/document/{document_id}/unlock")
async def unlock_document(
    document_id: str,
    data: UserID,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    try:
        session.execute(
            text(
                """DELETE FROM document.map_document_user_session
                WHERE document_id = :document_id AND user_id = :user_id"""
            )
            .bindparams(
                bindparam(key="document_id", type_=UUIDType),
                bindparam(key="user_id", type_=String),
            )
            .params(document_id=document_id, user_id=data.user_id)
        )
        session.commit()
        bulk_update_district_stats(session, [document_id], background_tasks)
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/document/{document_id}/status")
async def get_document_status(
    document_id: str, data: UserID, session: Session = Depends(get_session)
):
    stmt = (
        text(
            "SELECT * from document.map_document_user_session WHERE document_id = :document_id"
        )
        .bindparams(bindparam(key="document_id", type_=UUIDType))
        .params(document_id=document_id)
    )
    result = session.execute(stmt).fetchone()
    if result:
        # if user id matches, return the document checked out, otherwise return locked
        if result.user_id == data.user_id:
            # there's already a record so no need to create
            return {"status": DocumentEditStatus.checked_out}

        # the map is already checked out; should return as locked
        return {"status": DocumentEditStatus.locked}
    else:
        # the map is able to be checked out;
        # should return as unlocked, but should now
        # create a record in the map_document_user_session table
        session.execute(
            text(
                f"""INSERT INTO document.map_document_user_session (document_id, user_id)
                VALUES ('{document_id}', '{data.user_id}')"""
            )
        )
        session.commit()

        return {"status": DocumentEditStatus.checked_out}


@router.post("/api/document/{document_id}/share", response_model=DocumentShareResponse)
async def share_districtr_plan(
    document: Annotated[Document, Depends(get_document)],
    data: DocumentShareRequest,
    session: Session = Depends(get_session),
):
    existing_token = session.execute(
        text(
            """
            SELECT
                t.token_id,
                t.document_id,
                t.password_hash,
                d.public_id
            FROM document.map_document_token t
            LEFT JOIN document.document d ON t.document_id = d.document_id
            WHERE t.document_id = :doc_id
            """
        ),
        {"doc_id": document.document_id},
    ).fetchone()

    if existing_token:
        if data.password is not None and not existing_token.password_hash:
            hashed_password = hash_password(data.password)
            session.execute(
                text(
                    """
                    UPDATE document.map_document_token
                    SET password_hash = :password_hash
                    WHERE document_id = :document_id
                    """
                ),
                {
                    "password_hash": hashed_password,
                    "token_id": existing_token.token_id,
                    "document_id": document.document_id,
                },
            )
            session.commit()

        payload = {
            "token": existing_token.token_id,
            "access": data.access_type,
            "password_required": bool(existing_token.password_hash),
        }
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
        return {"token": token, "public_id": existing_token.public_id}

    else:
        hashed_password = hash_password(data.password) if data.password else None

        token_id = session.execute(
            text(
                """
                INSERT INTO document.map_document_token (token_id, document_id, password_hash)
                VALUES (gen_random_uuid(), :document_id, :password_hash)
                RETURNING token_id
                """
            ),
            {
                "document_id": document.document_id,
                "password_hash": hashed_password,
            },
        ).scalar_one()

        session.commit()

    payload = {
        "token": token_id,
        "access": data.access_type,
        "password_required": bool(hashed_password),
    }

    token = jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
    return {"token": token, "public_id": document.public_id}


@router.post("/api/document/{document_id}/checkout", status_code=status.HTTP_200_OK)
async def checkout_plan(
    document: Annotated[Document, Depends(get_protected_document)],
    data: DocumentCheckoutRequest,
    session: Session = Depends(get_session),
):
    """
    Check user-provided password against database.
    - if matches, check if map is checked out
    - if pw matches and not checked out, check map out to user
    - if pw matches and checked out, return warning that map is still locked but switch access to edit
    """
    try:
        result = session.execute(
            text(
                """
                SELECT password_hash
                FROM document.map_document_token
                WHERE document_id = :document_id
                """
            ),
            {"document_id": document.document_id},
        ).one()
    except NoResultFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This document has not been shared",
        )
    logger.info(
        f"Result: {data.password}, {'None' if not data.password else hash_password(data.password)}, {result.password_hash}"
    )
    if not result.password_hash or (
        data.password and verify_password(data.password, result.password_hash)
    ):
        assert document.document_id
        lock_status = check_map_lock(
            document_id=document.document_id, user_id=data.user_id, session=session
        )

        return {
            "status": lock_status,
            "access": DocumentShareStatus.edit
            if lock_status == DocumentEditStatus.unlocked
            else DocumentShareStatus.read,
            "document_id": document.document_id,
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password",
        )
