from fastapi import Depends, HTTPException, status
from sqlmodel import select, Session
from app.models import Document, DistrictrMap
from app.save_share.models import (
    MapDocumentToken,
)

# from sqlalchemy.sql.functions import coalesce
from sqlalchemy import or_, text

# from app.save_share.locks import check_map_lock
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


def get_document_public(
    public_id: int,
    document_id: str | None = None,
    session: Session = Depends(get_session),
) -> Document:
    """
    Gets a document based on its public id if the document has been flagged as
    ready to share.

    Do not leak the result of this function to the client as it contains the
    private document id.
    """
    stmt = select(Document)

    if document_id is None:
        stmt = stmt.where(Document.public_id == public_id).where(
            text("map_metadata->>'draft_status' = 'ready_to_share'")
        )
    else:
        stmt = stmt.where(Document.document_id == document_id)

    try:
        result = session.exec(stmt)
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Document not found")
    except Exception as e:
        logger.error(f"Error loading document: {str(e)}")
        raise HTTPException(status_code=500, detail="Error loading document")

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
