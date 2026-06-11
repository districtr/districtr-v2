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
        return token


class DistrictrTokenRefreshSerializer(TokenRefreshSerializer):
    token_class = KidRefreshToken
