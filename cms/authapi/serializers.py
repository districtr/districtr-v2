from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
    TokenRefreshSerializer,
)

from authapi.scopes import scopes_for_user
from authapi.tokens import KidRefreshToken


class DistrictrTokenObtainPairSerializer(TokenObtainPairSerializer):
    token_class = KidRefreshToken

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Space-delimited scope claim enforced verbatim by the FastAPI
        # backend's SecurityScopes (backend/app/core/security.py). Claims set
        # on the refresh token propagate to access tokens on refresh, so a
        # role change takes effect at next login, not next refresh — same
        # semantics as the Auth0 setup this replaces.
        token["sub"] = str(user.pk)
        token["scope"] = scopes_for_user(user)
        token["email"] = user.email
        token["name"] = user.get_full_name() or user.get_username()
        token["roles"] = sorted(g.name for g in user.groups.all())
        # Tag-scoped review (authapi/models.py:ReviewTagAssignment): the
        # backend's comment-moderation endpoints limit the holder to comments
        # carrying these tag slugs. The claim is ABSENT when the user has no
        # assignments — absent means unrestricted (back-compat for internal
        # reviewers). scopes_for_user strips `read:read-all` for assigned
        # users so the claim is actually enforced.
        review_tags = sorted(
            user.review_tag_assignments.values_list("tag_slug", flat=True)
        )
        if review_tags:
            token["review_tags"] = review_tags
        return token


class DistrictrTokenRefreshSerializer(TokenRefreshSerializer):
    token_class = KidRefreshToken
