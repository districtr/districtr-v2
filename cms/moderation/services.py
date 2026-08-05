"""
Per-user calls from the Wagtail admin to the FastAPI backend's moderation
endpoints.

Unlike datastore/services.py (service tokens), these calls mint a short-lived
access token for the ACTING USER (authapi.serializers.mint_user_access_token),
so the backend enforces the caller's own scopes and `review_tags` claim
exactly as it does for a normal login — the tag-scoping logic stays in one
place (backend/app/comments/main.py).
"""

import requests
from django.conf import settings

from authapi.serializers import mint_user_access_token
from datastore.services import REQUEST_TIMEOUT_SECONDS, BackendAPIError


def _call(user, method, path, *, params=None, json=None, what="request"):
    """Send `method` `path` to the backend; return the JSON body.

    With a `user`, authenticates as that user via a freshly minted access
    token; user=None sends unauthenticated (public endpoints). Non-200
    raises BackendAPIError surfacing the response's JSON `detail` verbatim —
    that is how the backend's tag-scope 403 messages reach the UI.
    """
    headers = {}
    if user is not None:
        headers["Authorization"] = f"Bearer {mint_user_access_token(user)}"
    response = requests.request(
        method,
        f"{settings.BACKEND_API_URL}{path}",
        params=params,
        json=json,
        headers=headers,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    if response.status_code != 200:
        try:
            body = response.json()
            detail = body.get("detail") if isinstance(body, dict) else None
        except ValueError:
            detail = None
        raise BackendAPIError(
            f"Backend rejected the {what} "
            f"(HTTP {response.status_code}): {detail or response.text[:500]}"
        )
    return response.json()


def _clean(params: dict) -> dict:
    """Drop empty filter values before sending.

    An OMITTED review_status means "not yet reviewed" on the backend
    (review_status IS NULL), so blanks must not be sent at all; empty
    strings/lists would likewise 422 or mis-filter.
    """
    return {k: v for k, v in params.items() if v not in (None, "", [])}


def list_form_comments(user, **params) -> list:
    """GET /api/comments/admin/list (scope create:content_review)."""
    return _call(
        user,
        "GET",
        "/api/comments/admin/list",
        params=_clean(params),
        what="comment list",
    )


def list_district_comments(user, **params) -> list:
    """GET /api/comments/admin/district-comments/list."""
    return _call(
        user,
        "GET",
        "/api/comments/admin/district-comments/list",
        params=_clean(params),
        what="district comment list",
    )


def review_item(user, content_type: str, item_id: int, review_status: str) -> dict:
    """POST /api/comments/admin/review for one comment/commenter/tag."""
    return _call(
        user,
        "POST",
        "/api/comments/admin/review",
        json={
            "content_type": content_type,
            "id": item_id,
            "review_status": review_status,
        },
        what="review update",
    )


def get_site_settings() -> dict:
    """GET /api/cms/site_settings (public)."""
    return _call(None, "GET", "/api/cms/site_settings", what="site settings fetch")


def update_site_settings(user, under_construction: bool) -> dict:
    """PATCH /api/cms/site_settings (scope update:update-all — admin only)."""
    return _call(
        user,
        "PATCH",
        "/api/cms/site_settings",
        json={"under_construction": under_construction},
        what="site settings update",
    )
