from fastapi import Depends, HTTPException, status
from sqlmodel import select, Session, literal, col
from app.core.models import DocumentID
from app.models import (
    Document,
    DocumentPublic,
    DocumentCommentPublic,
    DistrictrMap,
    DistrictrMapOverlays,
    Overlay,
    OverlayPublic,
)
from app.save_share.models import (
    DocumentShareStatus,
    MapDocumentToken,
)
from app.comments.models import DocumentComment, Comment
from app.comments.moderation import MODERATION_THRESHOLD
from app.comments.models import ReviewStatus
from sqlalchemy.sql.functions import coalesce
from sqlalchemy import or_, and_
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


def validate_document_exists(document_id: DocumentID, session: Session) -> bool:
    """
    Validate that the document exists. Raises HTTPException 404 if not found.
    Use when you only need to guard that the document exists and do not need its data.
    """
    get_protected_document(document_id=document_id, session=session)


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
        # Real document ID for internal use (fetching comments, etc.)
        Document.document_id.label("real_document_id"),
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
        coalesce(Document.num_districts, DistrictrMap.num_districts).label(
            "num_districts"
        ),  # pyright: ignore
        DistrictrMap.num_districts_modifiable.label("num_districts_modifiable"),  # pyright: ignore
        DistrictrMap.extent.label("extent"),  # pyright: ignore
        DistrictrMap.map_type.label("map_type"),  # pyright: ignore
        DistrictrMap.parent_geo_unit_type.label("parent_geo_unit_type"),  # pyright: ignore
        DistrictrMap.child_geo_unit_type.label("child_geo_unit_type"),  # pyright: ignore
        DistrictrMap.data_source_name.label("data_source_name"),  # pyright: ignore
        DistrictrMap.comment.label("comment"),  # pyright: ignore
        DistrictrMap.uuid.label("districtr_map_uuid"),  # pyright: ignore
        DistrictrMap.statefps.label("statefps"),  # pyright: ignore
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

    result = session.exec(stmt).one()

    # Fetch overlays via junction table if map has any
    overlays_list = None
    if result.districtr_map_uuid:
        junction_overlay_ids = session.exec(
            select(DistrictrMapOverlays.overlay_id).where(
                DistrictrMapOverlays.districtr_map_id == result.districtr_map_uuid
            )
        ).all()
        if junction_overlay_ids:
            overlays = session.exec(
                select(Overlay).where(
                    Overlay.overlay_id.in_(junction_overlay_ids)  # pyright: ignore
                )
            ).all()
            overlays_list = [
                OverlayPublic(
                    overlay_id=str(overlay.overlay_id),
                    name=overlay.name,
                    description=overlay.description,
                    data_type=overlay.data_type,
                    layer_type=overlay.layer_type,
                    custom_style=overlay.custom_style,
                    source=overlay.source,
                    source_layer=overlay.source_layer,
                    id_property=overlay.id_property,
                )
                for overlay in overlays
            ]

    # Fetch district comments from comments schema (DocumentComment with zone IS NOT NULL)
    # Apply moderation: if comment fails threshold, show placeholder text
    MODERATION_PLACEHOLDER = "Comment removed due to moderation."
    document_comments_list = None
    if result.real_document_id:
        stmt = (
            select(
                DocumentComment.comment_id,
                DocumentComment.zone,
                Comment.comment,
                Comment.created_at,
                Comment.updated_at,
                Comment.moderation_score,
                Comment.review_status,
            )
            .select_from(DocumentComment)
            .join(Comment, Comment.id == DocumentComment.comment_id)
            .where(
                and_(
                    col(DocumentComment.document_id) == result.real_document_id,
                    col(DocumentComment.zone).is_not(None),
                )
            )
        )
        doc_comments = session.exec(stmt).all()
        if len(doc_comments) > 0:
            document_comments_list = []
            is_edit_access = not document_id.is_public
            for dc in doc_comments:
                # Check moderation: show placeholder if rejected or exceeds threshold
                fails_moderation = dc.review_status == ReviewStatus.REJECTED or (
                    dc.moderation_score is not None
                    and dc.moderation_score > MODERATION_THRESHOLD
                    and dc.review_status != ReviewStatus.APPROVED
                )
                # Edit access: show full comment + moderated flag. Public: show placeholder only.
                if fails_moderation:
                    text = dc.comment if is_edit_access else MODERATION_PLACEHOLDER
                    moderated = True
                else:
                    text = dc.comment
                    moderated = False
                document_comments_list.append(
                    DocumentCommentPublic(
                        comment_id=str(dc.comment_id),
                        zone=dc.zone,
                        text=text,
                        moderated=moderated,
                        created_at=dc.created_at,
                        updated_at=dc.updated_at,
                    )
                )

    # Convert result to DocumentPublic with overlays and document comments
    return DocumentPublic(
        document_id=result.document_id,
        public_id=result.public_id,
        districtr_map_slug=result.districtr_map_slug,
        gerrydb_table=result.gerrydb_table,
        parent_layer=result.parent_layer,
        child_layer=result.child_layer,
        tiles_s3_path=result.tiles_s3_path,
        num_districts=result.num_districts,
        num_districts_modifiable=getattr(result, "num_districts_modifiable", True),
        created_at=result.created_at,
        updated_at=result.updated_at,
        extent=result.extent,
        map_metadata=result.map_metadata,
        access=result.access,
        color_scheme=result.color_scheme,
        map_type=result.map_type,
        map_module=result.map_module,
        comment=result.comment,
        parent_geo_unit_type=result.parent_geo_unit_type,
        child_geo_unit_type=result.child_geo_unit_type,
        data_source_name=result.data_source_name,
        overlays=overlays_list,
        statefps=result.statefps,
        document_comments=document_comments_list,
    )


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
