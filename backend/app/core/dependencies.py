from fastapi import Depends, HTTPException, status
from sqlmodel import select, Session, literal
from app.models import Document, DocumentPublic, DistrictrMap
from app.save_share.models import (
    DocumentShareStatus,
    DocumentEditStatus,
    MapDocumentToken,
)
from sqlalchemy.sql.functions import coalesce
from sqlalchemy import or_, text
from app.save_share.locks import check_map_lock
from sqlalchemy.exc import NoResultFound, MultipleResultsFound
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


def get_protected_document(
    document_id: str | int, session: Session = Depends(get_session)
) -> Document:
    """
    Always returns a document even if the token_id was used instead of the document_id. This function
    should be used for safe endpoints (i.e. GET requests). Any requests that modify
    data should use `get_document`. DO NOT return the result of this function
    from safe endpoints as this would leak the real document id.

    Supports:
    - UUID document IDs
    - Public IDs (numeric, for public sharing)
    """
    id_is_public = isinstance(document_id, int) or (
        isinstance(document_id, str) and document_id.isdigit()
    )

    stmt = select(Document)

    if id_is_public:
        stmt = stmt.where(Document.public_id == document_id).where(
            text("map_metadata->>'draft_status' = 'ready_to_share'")
        )
    else:
        stmt = stmt.where(Document.document_id == document_id)

    try:
        document = session.exec(stmt).one()
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Document not found")
    except Exception as e:
        logger.error(f"Error loading document: {str(e)}")
        raise HTTPException(status_code=500, detail="Error loading document")

    return document


def get_document_public(
    session: Session,
    document_id: str | int,
    user_id: str | None = None,
    shared: bool = False,
    lock_status: DocumentEditStatus | None = None,
) -> DocumentPublic:
    id_is_public = isinstance(document_id, int) or (
        isinstance(document_id, str) and document_id.isdigit()
    )

    if not document_id:
        raise HTTPException(status_code=404, detail="Document not found")
    document = get_protected_document(document_id=document_id, session=session)
    # TODO: Rather than being a separate query, this should be part of the main query

    access_type = DocumentShareStatus.read
    # Store if lock_status was explicitly provided
    lock_status_provided = lock_status is not None

    if document.document_id == document_id and not id_is_public:
        access_type = DocumentShareStatus.edit
        # Only check map lock if no lock_status was explicitly provided
        if not lock_status_provided:
            lock_status = check_map_lock(
                document.document_id, user_id=user_id, session=session
            )

    # Set default lock_status if not provided and not already set
    if lock_status is None:
        lock_status = DocumentEditStatus.locked

    stmt = select(
        # Obsured document ID
        literal("anonymous" if id_is_public else document_id).label("document_id"),
        Document.created_at,
        Document.districtr_map_slug,
        Document.gerrydb_table,
        Document.updated_at,
        Document.color_scheme,
        Document.public_id,
        DistrictrMap.parent_layer.label("parent_layer"),  # pyright: ignore
        DistrictrMap.child_layer.label("child_layer"),  # pyright: ignore
        DistrictrMap.tiles_s3_path.label("tiles_s3_path"),  # pyright: ignore
        DistrictrMap.name.label("map_module"),  # pyright: ignore
        DistrictrMap.num_districts.label("num_districts"),  # pyright: ignore
        DistrictrMap.extent.label("extent"),  # pyright: ignore
        DistrictrMap.map_type.label("map_type"),  # pyright: ignore
        # get metadata as a json object
        Document.map_metadata.label("map_metadata"),  # pyright: ignore
        coalesce(
            "shared" if shared else "created",
        ).label("genesis"),
        coalesce(
            lock_status,
        ).label("status"),
        coalesce(
            access_type,
        ).label("access"),
    ).join(
        DistrictrMap,
        Document.districtr_map_slug == DistrictrMap.districtr_map_slug,
        isouter=True,
    )

    if id_is_public:
        stmt = stmt.where(Document.public_id == document_id).where(
            text("map_metadata->>'draft_status' = 'ready_to_share'")
        )
    else:
        stmt = stmt.where(Document.document_id == document_id)

    result = session.exec(stmt)

    return result.one()


def get_districtr_map(
    document_id: str,
    session: Session = Depends(get_session),
) -> DistrictrMap:
    stmt = (
        select(DistrictrMap)
        .join(
            Document,
            onclause=Document.districtr_map_slug == DistrictrMap.districtr_map_slug,  # pyright: ignore
            isouter=True,
        )
        .join(
            MapDocumentToken,
            onclause=MapDocumentToken.document_id == Document.document_id,  # pyright: ignore
            isouter=True,
        )
        .filter(
            or_(
                Document.document_id == document_id,
                MapDocumentToken.document_id == document_id,
            )
        )  # pyright: ignore
    )

    try:
        districtr_map = session.exec(
            stmt,
        ).one()
    except NoResultFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with ID {document_id} not found",
        )
    except MultipleResultsFound:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Multiple DistrictrMaps found for Document with ID {document_id}",
        )

    return districtr_map
