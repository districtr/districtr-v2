"""
Claims minting for the RS256 access tokens the FastAPI backend verifies.

There is no login or refresh endpoint and no refresh token: the Wagtail admin
is session-authenticated, and views that call the backend mint a short-lived
access token in-process per request. Claims are re-derived on every mint, so
a role or team change takes effect on the user's next action.
"""

from datetime import timedelta

from authapi.scopes import scopes_for_user
from authapi.teams import team_slugs_for_user, user_is_team_scoped
from authapi.tokens import KidAccessToken


def set_user_claims(token, user) -> None:
    """Set the Districtr claims on a token.

    Space-delimited scope claim enforced verbatim by the FastAPI backend's
    SecurityScopes (backend/app/core/security.py).
    """
    group_names = sorted(g.name for g in user.groups.all())
    token["sub"] = str(user.pk)
    token["scope"] = scopes_for_user(user, group_names=group_names)
    token["email"] = user.email
    token["name"] = user.get_full_name() or user.get_username()
    token["roles"] = group_names
    # Submission-moderation scoping rides the teams: the backend intersects
    # this claim with form_configs.admin_teams per portal
    # (backend/app/submissions/main.py::require_portal_admin).
    # Admins/superusers get no claim (unrestricted — their scopes carry
    # review:review-all, the backend's only escape hatch); team-scoped users get their
    # team slugs; team-less non-admins get [] — fail closed until they join
    # a team.
    if not (user.is_superuser or "admin" in group_names):
        token["teams"] = team_slugs_for_user(user) if user_is_team_scoped(user) else []


def mint_user_access_token(user, lifetime_minutes: int = 5) -> str:
    """Short-lived access token for `user`, minted in-process.

    Used by Wagtail admin views (moderation) that call the FastAPI backend
    on the acting user's behalf, so the backend enforces the caller's own
    scopes and teams claim.
    """
    token = KidAccessToken()
    token.set_exp(lifetime=timedelta(minutes=lifetime_minutes))
    set_user_claims(token, user)
    return str(token)
