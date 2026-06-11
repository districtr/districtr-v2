"""
Group → OAuth-style scope mapping.

The scope strings MUST stay in sync with TokenScope in
backend/app/core/security.py — the FastAPI backend enforces them verbatim
via SecurityScopes on a space-delimited `scope` claim.
"""

# Mirrors backend/app/core/security.py::TokenScope
CREATE_DISTRICTR_MAPS = "create:districtr_maps"
READ_DISTRICTR_MAPS = "read:districtr_maps"
UPDATE_DISTRICTR_MAPS = "update:districtr_maps"
DELETE_DISTRICTR_MAPS = "delete:districtr_maps"

CREATE_CONTENT = "create:content"
READ_CONTENT = "read:content"
READ_ALL_CONTENT = "read:read-all"
UPDATE_CONTENT = "update:content"
UPDATE_ALL_CONTENT = "update:update-all"
PUBLISH_CONTENT = "update:publish"
DELETE_CONTENT = "delete:content"
DELETE_ALL_CONTENT = "delete:delete-all"

REVIEW_CONTENT = "create:content_review"

ALL_SCOPES = [
    CREATE_DISTRICTR_MAPS,
    READ_DISTRICTR_MAPS,
    UPDATE_DISTRICTR_MAPS,
    DELETE_DISTRICTR_MAPS,
    CREATE_CONTENT,
    READ_CONTENT,
    READ_ALL_CONTENT,
    UPDATE_CONTENT,
    UPDATE_ALL_CONTENT,
    PUBLISH_CONTENT,
    DELETE_CONTENT,
    DELETE_ALL_CONTENT,
    REVIEW_CONTENT,
]

GROUP_SCOPES = {
    "admin": ALL_SCOPES,
    "editor": [
        CREATE_CONTENT,
        READ_CONTENT,
        UPDATE_CONTENT,
        DELETE_CONTENT,
        PUBLISH_CONTENT,
    ],
    "reviewer": [
        REVIEW_CONTENT,
        READ_ALL_CONTENT,
    ],
    # Partners get Wagtail-side permissions (galleries, drafts) but no
    # FastAPI scopes.
    "partner": [],
}


def scopes_for_user(user, *, group_names=None, has_review_assignments=None) -> str:
    """Space-delimited scope claim for a Django user, from group membership.

    Superusers get every scope regardless of groups.

    Tag-scoped reviewers: when the user has ReviewTagAssignments (see
    authapi/models.py), the blanket `read:read-all` scope is stripped from
    the computed scopes — the FastAPI backend treats `read:read-all` as
    "unrestricted read" and would otherwise ignore the `review_tags` claim
    minted alongside it. `create:content_review` is kept so the moderation
    endpoints stay reachable (the backend then enforces the tag limits).
    Superusers and members of the admin group are unaffected: their
    assignments, if any, do not narrow their access.

    `group_names` / `has_review_assignments` let a caller that already has
    these (the token serializer) pass them in to avoid re-querying groups and
    assignments; when omitted they are loaded here.
    """
    if user.is_superuser:
        return " ".join(ALL_SCOPES)
    if group_names is None:
        group_names = [g.name for g in user.groups.all()]
    scopes: list[str] = []
    for name in group_names:
        for scope in GROUP_SCOPES.get(name, []):
            if scope not in scopes:
                scopes.append(scope)
    if READ_ALL_CONTENT in scopes and "admin" not in group_names:
        if has_review_assignments is None:
            has_review_assignments = user.review_tag_assignments.exists()
        if has_review_assignments:
            scopes.remove(READ_ALL_CONTENT)
    return " ".join(scopes)
