"""
Per-user calls from the Wagtail admin to the FastAPI backend's moderation
endpoints.

Unlike datastore/services.py (service tokens), these calls mint a short-lived
access token for the ACTING USER (authapi.serializers.mint_user_access_token),
so the backend enforces the caller's own scopes and `teams` claim exactly as
it does for a normal login — the teams x admin_teams scoping logic stays in
one place (backend/app/submissions/main.py).
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

    An OMITTED filter means "don't filter on this" on the backend (e.g. no
    `status` param returns drafts and submissions alike); blank strings/lists
    would 422 or mis-filter.
    """
    return {k: v for k, v in params.items() if v not in (None, "", [])}


def list_submissions(user, **params) -> list:
    """GET /api/submissions/admin (scope create:content_review; the backend
    checks the teams claim against the portal's admin_teams)."""
    return _call(
        user,
        "GET",
        "/api/submissions/admin",
        params=_clean(params),
        what="submission list",
    )


def set_submission_nsfw(user, submission_id: int, nsfw: bool) -> dict:
    """POST /api/submissions/admin/{id}/nsfw — blur/unblur."""
    return _call(
        user,
        "POST",
        f"/api/submissions/admin/{submission_id}/nsfw",
        json={"nsfw": nsfw},
        what="nsfw update",
    )


def set_submission_hidden(user, submission_id: int, hidden: bool) -> dict:
    """POST /api/submissions/admin/{id}/hidden — takedown/restore."""
    return _call(
        user,
        "POST",
        f"/api/submissions/admin/{submission_id}/hidden",
        json={"hidden": hidden},
        what="visibility update",
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
