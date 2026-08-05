from datetime import timedelta

from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
    TokenRefreshSerializer,
)

from authapi.scopes import scopes_for_user
from authapi.teams import team_slugs_for_user
from authapi.tokens import KidAccessToken, KidRefreshToken


def set_user_claims(token, user) -> None:
    """Set the Districtr claims on a token (login and in-process minting).

    Space-delimited scope claim enforced verbatim by the FastAPI backend's
    SecurityScopes (backend/app/core/security.py). Claims set on the refresh
    token propagate to access tokens on refresh, so a role change takes
    effect at next login, not next refresh — same semantics as the Auth0
    setup this replaces.
    """
    # Query groups and review-tag assignments once and reuse them for the
    # roles claim, the scope claim, and the review_tags claim — rather than
    # re-querying each inside scopes_for_user / the claim builders.
    group_names = sorted(g.name for g in user.groups.all())
    # Tag-scoped review (authapi/models.py:ReviewTagAssignment): the
    # backend's comment-moderation endpoints limit the holder to comments
    # carrying these tag slugs. The claim is ABSENT when the user has no
    # assignments — absent means unrestricted (back-compat for internal
    # reviewers). scopes_for_user strips `read:read-all` for assigned
    # users so the claim is actually enforced.
    review_tags = sorted(user.review_tag_assignments.values_list("tag_slug", flat=True))
    token["sub"] = str(user.pk)
    token["scope"] = scopes_for_user(
        user,
        group_names=group_names,
        has_review_assignments=bool(review_tags),
    )
    token["email"] = user.email
    token["name"] = user.get_full_name() or user.get_username()
    token["roles"] = group_names
    if review_tags:
        token["review_tags"] = review_tags
    # Slugs of the user's teams: the galleries API matches this claim
    # against Gallery.team for group_only galleries (admins bypass via the
    # roles claim). Absent when team-less.
    teams = sorted(team_slugs_for_user(user))
    if teams:
        token["teams"] = teams


def mint_user_access_token(user, lifetime_minutes: int = 5) -> str:
    """Short-lived access token for `user`, minted in-process.

    Used by Wagtail admin views (moderation) that call the FastAPI backend
    on the acting user's behalf, so the backend enforces the caller's own
    scopes and review_tags claim exactly as for a normal login. Builds a
    bare KidAccessToken rather than going through the refresh-token path,
    which would write an OutstandingToken row per mint.
    """
    token = KidAccessToken()
    token.set_exp(lifetime=timedelta(minutes=lifetime_minutes))
    set_user_claims(token, user)
    return str(token)


class DistrictrTokenObtainPairSerializer(TokenObtainPairSerializer):
    token_class = KidRefreshToken

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        set_user_claims(token, user)
        return token


class DistrictrTokenRefreshSerializer(TokenRefreshSerializer):
    token_class = KidRefreshToken
