"""
Token classes that sign with a `kid` JWT header.

PyJWKClient (used by the FastAPI backend in backend/app/core/security.py)
matches verification keys by the `kid` header; SimpleJWT's stock TokenBackend
never sets one. KidTokenBackend mirrors TokenBackend.encode but adds the
RFC 7638 thumbprint of the active verifying key.
"""

from datetime import timedelta
from typing import Any, Optional

import jwt
from rest_framework_simplejwt.backends import TokenBackend
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from authapi.jwks import current_kid


class KidTokenBackend(TokenBackend):
    def encode(self, payload: dict[str, Any]) -> str:
        jwt_payload = payload.copy()
        if self.audience is not None:
            jwt_payload["aud"] = self.audience
        if self.issuer is not None:
            jwt_payload["iss"] = self.issuer

        return jwt.encode(
            jwt_payload,
            self.prepared_signing_key,
            algorithm=self.algorithm,
            json_encoder=self.json_encoder,
            headers={"kid": current_kid()},
        )


_backend: Optional[KidTokenBackend] = None


def get_kid_token_backend() -> KidTokenBackend:
    global _backend
    if _backend is None:
        _backend = KidTokenBackend(
            api_settings.ALGORITHM,
            api_settings.SIGNING_KEY,
            api_settings.VERIFYING_KEY,
            api_settings.AUDIENCE,
            api_settings.ISSUER,
            api_settings.JWK_URL,
            api_settings.LEEWAY,
            api_settings.JSON_ENCODER,
        )
    return _backend


class KidAccessToken(AccessToken):
    @property
    def token_backend(self) -> TokenBackend:
        return get_kid_token_backend()


class KidRefreshToken(RefreshToken):
    access_token_class = KidAccessToken

    @property
    def token_backend(self) -> TokenBackend:
        return get_kid_token_backend()


def mint_service_token(name: str, scopes: list[str], lifetime_minutes: int = 15) -> str:
    """Short-lived RS256 service token (sub=service:<name>, space-joined scopes).

    The canonical service-to-service minting path: datastore/services.py uses
    it for backend calls and the issue_service_token management command
    delegates to it.
    """
    token = KidAccessToken()
    token.set_exp(lifetime=timedelta(minutes=lifetime_minutes))
    token["sub"] = f"service:{name}"
    token["scope"] = " ".join(scopes)
    return str(token)
