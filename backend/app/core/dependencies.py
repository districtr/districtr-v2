from fastapi import Depends, HTTPException
from sqlmodel import select, Session
from app.models import Document, DocumentPublic, DistrictrMap
from app.save_share.models import DocumentShareStatus, DocumentEditStatus
from sqlalchemy.sql.functions import coalesce
from app.save_share.locks import check_map_lock
from sqlalchemy.exc import NoResultFound
from app.core.db import get_session
import logging

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def get_document(document_id: str, session: Session = Depends(get_session)) -> Document:
    try:
        document = session.exec(
            select(Document).where(Document.document_id == document_id)
        ).one()
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Document not found")
    except Exception as e:
        logger.error(f"Error loading document: {str(e)}")
        raise HTTPException(status_code=500, detail="Error loading document")

    return document


def get_document_public(
    document_id: str,
    user_id: str,
    session: Session,
    shared: bool = False,
    access_type: DocumentShareStatus = DocumentShareStatus.edit,
    lock_status: DocumentEditStatus | None = None,
) -> DocumentPublic:
    # TODO: Rather than being a separate query, this should be part of the main query
    if access_type == DocumentShareStatus.read:
        check_lock_status = DocumentEditStatus.locked
    elif lock_status != DocumentEditStatus.locked:
        check_lock_status = check_map_lock(document_id, user_id, session)
    else:
        check_lock_status = lock_status

    stmt = (
        select(
            Document.document_id,
            Document.created_at,
            Document.districtr_map_slug,
            Document.gerrydb_table,
            Document.updated_at,
            Document.color_scheme,
            DistrictrMap.parent_layer.label("parent_layer"),  # pyright: ignore
            DistrictrMap.child_layer.label("child_layer"),  # pyright: ignore
            DistrictrMap.tiles_s3_path.label("tiles_s3_path"),  # pyright: ignore
            DistrictrMap.num_districts.label("num_districts"),  # pyright: ignore
            DistrictrMap.extent.label("extent"),  # pyright: ignore
            # get metadata as a json object
            Document.map_metadata.label("map_metadata"),  # pyright: ignore
            coalesce(
                "shared" if shared else "created",
            ).label("genesis"),
            coalesce(
                check_lock_status,  # locked, unlocked, checked_out
            ).label("status"),
            coalesce(
                access_type,
            ).label("access"),  # read or edit
            # add access - read or edit
        )  # pyright: ignore
        .where(Document.document_id == document_id)
        .join(
            DistrictrMap,
            Document.districtr_map_slug == DistrictrMap.districtr_map_slug,
            isouter=True,
        )
    )
    result = session.exec(stmt)

    return result.one()
