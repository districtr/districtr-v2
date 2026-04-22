from typing import TypedDict

from fastapi import (
    status,
    HTTPException,
)
from sqlmodel import Session, select
from app.models import (
    AssignmentsMetadata,
    CommunityMetadata,
    Document,
    MAX_COMMUNITY_NAME_LENGTH,
    sanitize_community_name,
)


class CommentDict(TypedDict):
    zone: int | None
    text: str | None
    comment_id: int | None


def _load_existing_community_metadata(
    session: Session, document_id: str
) -> list[CommunityMetadata]:
    """
    Load the existing community metadata for a document from the database.

    Args:
        session (sqlmodels.Session): The SQLModel session to use for the database query.
        document_id (str): The ID of the document for which to load community metadata. Expects a
            UUID string.

    Returns:
        A list of CommunityMetadata instances representing the existing community metadata for the
        document.
    """
    raw_communities = session.exec(
        select(Document.community_metadata_list).where(
            Document.document_id == document_id
        )
    ).one_or_none()
    if not raw_communities:
        return []
    return [
        (
            community
            if isinstance(community, CommunityMetadata)
            else CommunityMetadata.model_validate(community)
        )
        for community in raw_communities
    ]


def _normalize_community_metadata_list(
    community_metadata_list: list[CommunityMetadata] | list[dict],
) -> list[CommunityMetadata]:
    """
    Normalize a list of community metadata by sanitizing the community names and validating the
    lengths of the names.

    Args:
        community_metadata_list (list[CommunityMetadata]): A list of CommunityMetadata instances
            or dictionaries representing community metadata to be normalized.

    Returns:
        A list of CommunityMetadata instances with sanitized and validated community names.
    """
    normalized_communities: list[CommunityMetadata] = []
    for raw_community in community_metadata_list:
        community = (
            raw_community
            if isinstance(raw_community, CommunityMetadata)
            else CommunityMetadata.model_validate(raw_community)
        )
        sanitized_name = sanitize_community_name(community.name)
        community_label = f"Community {community.render_order_id}"

        if not sanitized_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{community_label} name cannot be empty.",
            )
        if len(sanitized_name) > MAX_COMMUNITY_NAME_LENGTH:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"{community_label} name must be {MAX_COMMUNITY_NAME_LENGTH} "
                    "characters or fewer."
                ),
            )

        normalized_communities.append(
            community.model_copy(update={"name": sanitized_name})
        )

    return normalized_communities


def _validate_community_save_payload(
    *,
    metadata: AssignmentsMetadata | None,
) -> list[CommunityMetadata] | None:
    """
    Validate the community metadata in the save payload for a community map.

    Returns:
        list[CommunityMetadata]: the validated, normalized list the caller should persist
            (only when the payload included community_metadata_list).
        None: the payload did not include community_metadata_list; caller should leave
            existing metadata unchanged.

    Raises:
        HTTPException(400): if the payload explicitly provides an empty community_metadata_list
            (community mode requires at least one community; to exit community mode, change
            map_type instead), or if sanitization checks fail.
    """
    incoming_list_provided = (
        metadata is not None and metadata.community_metadata_list is not None
    )

    if not incoming_list_provided:
        return None

    if len(metadata.community_metadata_list) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Community mode requires at least one community. "
                "To exit community mode, change map_type instead of sending an empty list."
            ),
        )

    return _normalize_community_metadata_list(metadata.community_metadata_list)
