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
# Explicit bypass of per-reviewer tag scoping. Only admins/superusers get it;
# see the PARTNER_SCOPES note below.
REVIEW_ALL_CONTENT = "review:review-all"

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
    REVIEW_ALL_CONTENT,
]

# Page editing, galleries, and the datastore tools are all Wagtail-side
# permissions (or service-token calls); the only FastAPI scope a user token
# needs is submission moderation. No review:review-all: the backend treats
# that scope as "unrestricted, ignore the teams claim", and partner
# moderation is always scoped by the teams claim x form_configs.admin_teams
# (serializers.py). super_partner's extra powers are Django model
# permissions, not scopes.
PARTNER_SCOPES = [
    REVIEW_CONTENT,
]

GROUP_SCOPES = {
    "admin": ALL_SCOPES,
    "partner": PARTNER_SCOPES,
    "super_partner": PARTNER_SCOPES,
}


def scopes_for_user(user, *, group_names=None) -> str:
    """Space-delimited scope claim for a Django user, from group membership.

    Superusers get every scope regardless of groups. `group_names` lets a
    caller that already has them (the token serializer) avoid re-querying.
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
    return " ".join(scopes)
