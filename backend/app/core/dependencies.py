from fastapi import Depends, HTTPException, status
from sqlmodel import select, Session, literal
from app.core.models import DocumentID
from app.models import Document, DocumentPublic, DistrictrMap
from app.save_share.models import (
    DocumentShareStatus,
    MapDocumentToken,
)
from sqlalchemy.sql.functions import coalesce
from sqlalchemy import or_
from sqlalchemy.exc import NoResultFound, MultipleResultsFound
from app.core.db import get_session
import logging

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def parse_document_id(document_id: str | int) -> DocumentID:
    try:
        return DocumentID(document_id=document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document ID")


def get_document(
    document_id: DocumentID = Depends(parse_document_id),
    session: Session = Depends(get_session),
) -> Document:
    """
    Get a document by the private ID.
    """
    try:
        document = session.exec(
            select(Document).where(Document.document_id == document_id.value)
        ).one()
    except NoResultFound:
        raise HTTPException(status_code=404, detail="Document not found")
    except Exception as e:
        logger.error(f"Error loading document: {str(e)}")
        raise HTTPException(status_code=500, detail="Error loading document")

    return document


def get_protected_document(
    document_id: DocumentID = Depends(parse_document_id),
    session: Session = Depends(get_session),
) -> Document:
    """
    Always returns a document even if the public_id was used instead of the document_id. This function
    should be used for safe endpoints (i.e. GET requests). Any requests that modify
    data should use `get_document`. DO NOT return the result of this function
    from safe endpoints as this would leak the real document id.

    Supports:
    - UUID document IDs
    - Public IDs (numeric, for public sharing)
    """
    stmt = select(Document)

    if document_id.is_public:
        stmt = stmt.where(Document.public_id == document_id.value)
    else:
        stmt = stmt.where(Document.document_id == document_id.value)

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
    document_id: DocumentID = Depends(parse_document_id),
    shared: bool = False,
) -> DocumentPublic:
    """
    Get a document by the public or private ID.
    """
    access_type = DocumentShareStatus.read

    if not document_id.is_public:
        access_type = DocumentShareStatus.edit

    stmt = select(
        # Obsured document ID
        literal(
            "anonymous" if document_id.is_public else document_id.document_id
        ).label("document_id"),
        Document.created_at,
        Document.districtr_map_slug,
        Document.updated_at,
        Document.color_scheme,
        Document.public_id,
        DistrictrMap.gerrydb_table_name.label("gerrydb_table"),  # pyright: ignore
        DistrictrMap.parent_layer.label("parent_layer"),  # pyright: ignore
        DistrictrMap.child_layer.label("child_layer"),  # pyright: ignore
        DistrictrMap.tiles_s3_path.label("tiles_s3_path"),  # pyright: ignore
        DistrictrMap.name.label("map_module"),  # pyright: ignore
        coalesce(Document.num_districts, DistrictrMap.num_districts).label("num_districts"),  # pyright: ignore
        DistrictrMap.extent.label("extent"),  # pyright: ignore
        DistrictrMap.map_type.label("map_type"),  # pyright: ignore
        DistrictrMap.parent_geo_unit_type.label("parent_geo_unit_type"),  # pyright: ignore
        DistrictrMap.child_geo_unit_type.label("child_geo_unit_type"),  # pyright: ignore
        DistrictrMap.data_source_name.label("data_source_name"),  # pyright: ignore
        DistrictrMap.comment.label("comment"),  # pyright: ignore
        # get metadata as a json object
        Document.map_metadata.label("map_metadata"),  # pyright: ignore
        coalesce(
            access_type,
        ).label("access"),
    ).join(
        DistrictrMap,
        Document.districtr_map_slug == DistrictrMap.districtr_map_slug,
        isouter=True,
    )

    if document_id.is_public:
        stmt = stmt.where(Document.public_id == document_id.value)
    else:
        stmt = stmt.where(Document.document_id == document_id.value)

    result = session.exec(stmt)

    return result.one()


def get_districtr_map(
    document_id: DocumentID = Depends(parse_document_id),
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
