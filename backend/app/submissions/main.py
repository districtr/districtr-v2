"""The submissions API: public form submission and team-scoped moderation.

Replaces /api/comments/*. Key decisions:

- No approval gate. Everything visible unless a reviewer hides it; moderation
  sets `nsfw`, which the public list serves and the frontend blurs.
- Admin scoping is the JWT `teams` claim intersected with the portal's
  form_configs.admin_teams. `read:read-all` in the token scopes is the
  admin/superuser escape hatch (same convention the old review_tags scoping
  used); an absent teams claim is unrestricted (service tokens), an empty one
  allows nothing.
- Maps are attached by cloning: the referenced plan must be ready_to_share,
  gets copied (assignments, zone notes, metadata), and the submission stores
  the clone's public_id. The clone's edit UUID is generated here and never
  returned to anyone, so gallery entries are frozen.
"""

import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    Security,
    status,
)
from sqlalchemy import exists, literal
from sqlalchemy.sql import and_
from sqlmodel import Session, col, select

from app.assignments.assignments import (
    duplicate_document_assignments,
    duplicate_document_community_assignments,
)
from app.core.db import get_session
from app.core.dependencies import get_protected_document
from app.core.models import DocumentID
from app.core.security import (
    TokenScope,
    auth,
    client_ip_from_request,
    require_session,
    turnstile,
)
from app.district_notes import duplicate_district_notes
from app.models import Document
from app.save_share.models import DocumentDraftStatus
from app.submissions.fields import (
    PRIVATE_FIELDS,
    slugify,
    validate_submission_fields,
)
from app.submissions.moderation import moderate_submission_by_id
from app.submissions.models import (
    FlagSubmissionRequest,
    FormConfig,
    FormConfigPublic,
    HiddenUpdate,
    NsfwUpdate,
    Submission,
    SubmissionAdmin,
    SubmissionContent,
    SubmissionCreate,
    SubmissionCreated,
    SubmissionFinalize,
    SubmissionPublic,
    SubmissionStatus,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["submissions"], prefix="/api/submissions")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def get_form_config(portal_id: str, session: Session) -> FormConfig:
    config = session.exec(
        select(FormConfig).where(col(FormConfig.portal_id) == portal_id)
    ).first()
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No form config for portal {portal_id!r}",
        )
    return config


def require_portal_admin(auth_result: dict, config: FormConfig) -> None:
    """Enforce team scoping for one portal's submissions.

    Every admin handler MUST resolve the submission's portal config and call
    this before acting — the scope check alone does not carry the team
    restriction. Semantics: `review:review-all` scope → unrestricted (the
    explicit moderation-reach bypass; read:read-all deliberately does NOT
    widen moderation, see TokenScope); absent `teams` claim → unrestricted
    (service tokens); otherwise the claim must intersect the portal's
    admin_teams.
    """
    token_scopes = (auth_result.get("scope") or "").split()
    if TokenScope.review_all_content in token_scopes:
        return
    teams = auth_result.get("teams")
    if teams is None:
        return
    if not set(str(t) for t in teams) & set(config.admin_teams):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Your teams {sorted(str(t) for t in teams)} do not administer "
                f"portal {config.portal_id!r} (teams {sorted(config.admin_teams)})."
            ),
        )


def _is_team_scoped(auth_result: dict) -> bool:
    token_scopes = (auth_result.get("scope") or "").split()
    return (
        TokenScope.review_all_content not in token_scopes
        and auth_result.get("teams") is not None
    )


def clone_document_for_submission(session: Session, source: Document) -> Document:
    """Snapshot a plan for a gallery submission.

    Copies assignments, zone notes, and map_metadata (the gallery renders
    name/description from it, and the clone must stay ready_to_share — normal
    copies drop metadata, this one must not). Share tokens are not copied.
    The clone's document_id (edit capability) is never returned to a caller
    response; only its public_id is stored on the submission.
    """
    clone = Document(
        document_id=str(uuid4()),
        districtr_map_slug=source.districtr_map_slug,
        map_type=source.map_type,
        document_type=source.document_type,
        num_districts=source.num_districts,
        num_communities=source.num_communities,
        community_metadata_list=source.community_metadata_list,
        map_metadata=source.map_metadata,
    )
    session.add(clone)
    session.flush()  # assigns public_id
    assert clone.document_id is not None and source.document_id is not None
    if source.map_type == "community":
        duplicate_document_community_assignments(
            from_document_id=source.document_id,
            to_document_id=clone.document_id,
            session=session,
        )
    else:
        duplicate_document_assignments(
            from_document_id=source.document_id,
            to_document_id=clone.document_id,
            session=session,
        )
    duplicate_district_notes(
        from_document_id=source.document_id,
        to_document_id=clone.document_id,
        session=session,
    )
    return clone


def _resolve_ready_document(map_ref: str | int, session: Session) -> Document:
    """Resolve a map reference and require it to be ready_to_share."""
    try:
        document = get_protected_document(
            document_id=DocumentID(document_id=str(map_ref)), session=session
        )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Map {map_ref!r} not found",
        )
    draft_status = (document.map_metadata or {}).get("draft_status")
    if draft_status != DocumentDraftStatus.ready_to_share:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Map must be marked ready to share before submitting",
        )
    return document


def _normalized_tags(tags: list[str], portal_id: str) -> list[str]:
    """Slugify, dedupe, and guarantee the portal's own tag is present."""
    slugs = [slugify(t) for t in tags]
    slugs = [s for s in slugs if s]
    if portal_id not in slugs:
        slugs.insert(0, portal_id)
    return list(dict.fromkeys(slugs))


def _insert_content(
    submission_pk: int, values: dict[str, str], session: Session
) -> None:
    for field, value in values.items():
        if not value or not value.strip():
            continue  # sparse: empty values are not stored
        session.add(
            SubmissionContent(
                submission_id=submission_pk, field=field, value=value.strip()
            )
        )


def _validate_or_422(config: FormConfig, values: dict[str, str]) -> None:
    errors = validate_submission_fields(config.fields, config.required_fields, values)
    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=errors
        )


def _fields_by_submission(
    submission_ids: list[int], session: Session, include_private: bool
) -> dict[int, dict[str, str]]:
    """Pivot the EAV rows for a set of submissions into per-id dicts."""
    if not submission_ids:
        return {}
    stmt = select(
        SubmissionContent.submission_id,
        SubmissionContent.field,
        SubmissionContent.value,
    ).where(col(SubmissionContent.submission_id).in_(submission_ids))
    if not include_private:
        stmt = stmt.where(col(SubmissionContent.field).not_in(PRIVATE_FIELDS))
    out: dict[int, dict[str, str]] = {}
    for submission_id, field, value in session.exec(stmt).all():  # type: ignore[no-matching-overload]
        out.setdefault(submission_id, {})[field] = value
    return out


def _content_field_exists(field: str, value_clause):
    """EXISTS over submissions_content for one field, correlated to Submission."""
    return exists(
        select(literal(1))
        .select_from(SubmissionContent)
        .where(
            and_(
                col(SubmissionContent.submission_id) == Submission.id,
                col(SubmissionContent.field) == field,
                value_clause,
            )
        )
        .correlate(Submission)
    )


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------


@router.post("", response_model=SubmissionCreated, status_code=status.HTTP_201_CREATED)
async def create_submission(
    data: SubmissionCreate,
    background_tasks: BackgroundTasks,
    request: Request,
    session: Session = Depends(get_session),
):
    """Submit a portal form, optionally attaching (a frozen clone of) a map."""
    await turnstile.verify_turnstile(
        data.turnstile_token, client_ip_from_request(request)
    )
    config = get_form_config(data.portal_id, session)
    _validate_or_422(config, data.fields)

    map_public_id = None
    if data.map_ref is not None:
        source = _resolve_ready_document(data.map_ref, session)
        clone = clone_document_for_submission(session, source)
        map_public_id = clone.public_id

    submission = Submission(
        portal_id=config.portal_id,
        map_public_id=map_public_id,
        tags=_normalized_tags(data.tags, config.portal_id),
        status=SubmissionStatus.submitted,
        submitted_at=datetime.now(timezone.utc),
    )
    session.add(submission)
    session.flush()
    _insert_content(submission.id, data.fields, session)
    session.commit()
    session.refresh(submission)

    background_tasks.add_task(moderate_submission_by_id, submission.id)
    return SubmissionCreated(id=submission.id, submission_id=submission.submission_id)


@router.put("/{submission_id}/finalize", response_model=SubmissionCreated)
async def finalize_submission(
    submission_id: str,
    data: SubmissionFinalize,
    background_tasks: BackgroundTasks,
    request: Request,
    session: Session = Depends(get_session),
):
    """Finalize a draft submission (created alongside a map via ?portal=).

    The submission_id UUID is the write capability: unknown ids 404 (no
    oracle), non-drafts 409. The draft's working document is cloned and the
    submission repointed at the frozen clone.
    """
    await turnstile.verify_turnstile(
        data.turnstile_token, client_ip_from_request(request)
    )
    submission = session.exec(
        select(Submission).where(col(Submission.submission_id) == submission_id)
    ).first()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    if submission.status != SubmissionStatus.draft:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Submission has already been finalized",
        )

    config = get_form_config(submission.portal_id, session)
    _validate_or_422(config, data.fields)

    if submission.map_public_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The map for this draft submission no longer exists",
        )
    source = _resolve_ready_document(submission.map_public_id, session)
    clone = clone_document_for_submission(session, source)

    submission.map_public_id = clone.public_id
    submission.tags = _normalized_tags(data.tags, config.portal_id)
    submission.status = SubmissionStatus.submitted
    submission.submitted_at = datetime.now(timezone.utc)
    session.add(submission)
    _insert_content(submission.id, data.fields, session)
    session.commit()

    background_tasks.add_task(moderate_submission_by_id, submission.id)
    return SubmissionCreated(id=submission.id, submission_id=submission_id)


@router.get("", response_model=list[SubmissionPublic])
async def list_submissions(
    portal_id: str,
    tags: list[str] | None = Query(default=None),
    place: str | None = Query(default=None),
    state: str | None = Query(default=None),
    zip_code: str | None = Query(default=None),
    search: str | None = Query(default=None),
    has_map: bool | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, le=100),
    session: Session = Depends(get_session),
):
    """List a portal's visible submissions. nsfw rows are included — the
    frontend blurs them with an opt-in reveal."""
    stmt = (
        select(Submission)
        .where(
            and_(
                col(Submission.portal_id) == portal_id,
                col(Submission.status) == SubmissionStatus.submitted,
                col(Submission.hidden).is_(False),
            )
        )
        .order_by(col(Submission.created_at).desc())
        .offset(offset)
        .limit(limit)
    )
    if tags:
        stmt = stmt.where(col(Submission.tags).overlap(tags))
    for field, value in (("place", place), ("state", state), ("zip_code", zip_code)):
        if value:
            stmt = stmt.where(
                _content_field_exists(field, col(SubmissionContent.value) == value)
            )
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            exists(
                select(literal(1))
                .select_from(SubmissionContent)
                .where(
                    and_(
                        col(SubmissionContent.submission_id) == Submission.id,
                        col(SubmissionContent.field).in_(["title", "comment"]),
                        col(SubmissionContent.value).ilike(pattern),
                    )
                )
                .correlate(Submission)
            )
        )
    if has_map is not None:
        stmt = stmt.where(
            col(Submission.map_public_id).is_not(None)
            if has_map
            else col(Submission.map_public_id).is_(None)
        )

    submissions = session.exec(stmt).all()
    fields = _fields_by_submission(
        [s.id for s in submissions], session, include_private=False
    )
    return [
        SubmissionPublic(
            id=s.id,
            portal_id=s.portal_id,
            tags=s.tags,
            nsfw=s.nsfw,
            map_public_id=s.map_public_id,
            created_at=s.created_at,
            submitted_at=s.submitted_at,
            fields=fields.get(s.id, {}),
        )
        for s in submissions
    ]


@router.get("/form_config", response_model=FormConfigPublic)
async def get_form_config_public(
    portal_id: str,
    session: Session = Depends(get_session),
):
    """Public read of a portal's form shape (used by the abbreviated
    map-submission form; the CMS injects the same data into portal pages)."""
    return get_form_config(portal_id, session)


@router.post(
    "/flag",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_session)],
)
async def flag_submission(
    body: FlagSubmissionRequest,
    session: Session = Depends(get_session),
):
    """Report a submission for reviewer attention. Only publicly visible
    submissions can be flagged — flagging hidden ones gives moderators no
    signal and is a way to harass the queue."""
    submission = session.get(Submission, body.id)
    if (
        submission is None
        or submission.hidden
        or submission.status != SubmissionStatus.submitted
    ):
        raise HTTPException(status_code=404, detail="Submission not found")
    submission.flagged = True
    session.add(submission)
    session.commit()
    return {"message": "Submission flagged for review", "id": body.id}


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


@router.get("/admin", response_model=list[SubmissionAdmin])
async def list_submissions_admin(
    portal_id: str | None = Query(default=None),
    submission_status: str | None = Query(
        default=None, alias="status", description="draft | submitted; default both"
    ),
    flagged: bool | None = Query(default=None),
    nsfw: bool | None = Query(default=None),
    hidden: bool | None = Query(default=None),
    has_map: bool | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, le=100),
    session: Session = Depends(get_session),
    auth_result: dict = Security(auth.verify, scopes=[TokenScope.review_content]),
):
    """Team-scoped moderation queue. portal_id is required for team-scoped
    tokens — omitting it would be the bypass-by-URL bug class."""
    if portal_id is None:
        if _is_team_scoped(auth_result):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="portal_id is required for team-scoped tokens",
            )
    else:
        config = get_form_config(portal_id, session)
        require_portal_admin(auth_result, config)

    stmt = (
        select(Submission)
        .order_by(col(Submission.created_at).desc())
        .offset(offset)
        .limit(limit)
    )
    if portal_id is not None:
        stmt = stmt.where(col(Submission.portal_id) == portal_id)
    if submission_status is not None:
        stmt = stmt.where(col(Submission.status) == submission_status)
    if flagged is not None:
        stmt = stmt.where(col(Submission.flagged).is_(flagged))
    if nsfw is not None:
        stmt = stmt.where(col(Submission.nsfw).is_(nsfw))
    if hidden is not None:
        stmt = stmt.where(col(Submission.hidden).is_(hidden))
    if has_map is not None:
        stmt = stmt.where(
            col(Submission.map_public_id).is_not(None)
            if has_map
            else col(Submission.map_public_id).is_(None)
        )

    submissions = session.exec(stmt).all()
    fields = _fields_by_submission(
        [s.id for s in submissions], session, include_private=True
    )
    return [
        SubmissionAdmin(
            id=s.id,
            portal_id=s.portal_id,
            tags=s.tags,
            nsfw=s.nsfw,
            map_public_id=s.map_public_id,
            created_at=s.created_at,
            submitted_at=s.submitted_at,
            status=s.status,
            hidden=s.hidden,
            flagged=s.flagged,
            moderation_score=s.moderation_score,
            fields=fields.get(s.id, {}),
        )
        for s in submissions
    ]


def _get_submission_for_admin(
    submission_pk: int, auth_result: dict, session: Session
) -> Submission:
    submission = session.get(Submission, submission_pk)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    config = get_form_config(submission.portal_id, session)
    require_portal_admin(auth_result, config)
    return submission


@router.post("/admin/{submission_pk}/nsfw")
async def set_submission_nsfw(
    submission_pk: int,
    body: NsfwUpdate,
    session: Session = Depends(get_session),
    auth_result: dict = Security(auth.verify, scopes=[TokenScope.review_content]),
):
    """Toggle the nsfw blur both ways (unblur false positives, blur misses).
    Resolves the user's flag report."""
    submission = _get_submission_for_admin(submission_pk, auth_result, session)
    submission.nsfw = body.nsfw
    submission.flagged = False
    session.add(submission)
    session.commit()
    return {"id": submission_pk, "nsfw": body.nsfw}


@router.post("/admin/{submission_pk}/hidden")
async def set_submission_hidden(
    submission_pk: int,
    body: HiddenUpdate,
    session: Session = Depends(get_session),
    auth_result: dict = Security(auth.verify, scopes=[TokenScope.review_content]),
):
    """Hard takedown/restore for spam and abuse. Resolves the flag report."""
    submission = _get_submission_for_admin(submission_pk, auth_result, session)
    submission.hidden = body.hidden
    submission.flagged = False
    session.add(submission)
    session.commit()
    return {"id": submission_pk, "hidden": body.hidden}
