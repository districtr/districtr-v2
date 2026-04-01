import jwt
import logging
from fastapi import Depends, HTTPException, status
from fastapi.security import SecurityScopes, HTTPAuthorizationCredentials, HTTPBearer
import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class TokenScope:
    create_districtr_maps = "create:districtr_maps"
    read_districtr_maps = "read:districtr_maps"
    update_districtr_maps = "update:districtr_maps"
    delete_districtr_maps = "delete:districtr_maps"

    create_content = "create:content"
    read_content = "read:content"
    read_all_content = "read:read-all"

    update_content = "update:content"
    update_all_content = "update:update-all"
    publish_content = "update:publish"
    delete_content = "delete:content"
    delete_all_content = "delete:delete-all"

    review_content = "create:content_review"


# Payload CMS role -> scope mapping.
# Lets existing scope-based endpoint guards work with Payload JWTs.
PAYLOAD_ROLE_SCOPES: dict[str, list[str]] = {
    "admin": [
        TokenScope.create_districtr_maps,
        TokenScope.read_districtr_maps,
        TokenScope.update_districtr_maps,
        TokenScope.delete_districtr_maps,
        TokenScope.create_content,
        TokenScope.read_content,
        TokenScope.read_all_content,
        TokenScope.update_content,
        TokenScope.update_all_content,
        TokenScope.publish_content,
        TokenScope.delete_content,
        TokenScope.delete_all_content,
        TokenScope.review_content,
    ],
    "editor": [
        TokenScope.create_content,
        TokenScope.read_content,
        TokenScope.update_content,
        TokenScope.delete_content,
    ],
    "reviewer": [
        TokenScope.read_content,
        TokenScope.read_all_content,
        TokenScope.review_content,
    ],
}


class UnauthorizedException(HTTPException):
    def __init__(self, detail: str, **kwargs):
        """Returns HTTP 403"""
        super().__init__(status.HTTP_403_FORBIDDEN, detail=detail)


class UnauthenticatedException(HTTPException):
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Requires authentication"
        )


class VerifyToken:
    """Verifies Payload CMS JWTs (HS256).

    Payload JWTs contain: id, email, role, collection, iat, exp.
    The role is mapped to scopes for backward-compatible endpoint guards.
    """

    def __init__(self):
        self.config = get_settings()

    def _verify_payload_jwt(self, token_str: str) -> dict:
        """Verify a Payload CMS JWT (HS256 with PAYLOAD_SECRET)."""
        if not self.config.PAYLOAD_SECRET:
            raise UnauthorizedException("Payload auth not configured")

        try:
            decoded = jwt.decode(
                token_str,
                self.config.PAYLOAD_SECRET,
                algorithms=["HS256"],
            )
        except jwt.ExpiredSignatureError:
            raise UnauthorizedException("Token expired")
        except Exception as error:
            raise UnauthorizedException(str(error))

        if not decoded:
            raise UnauthorizedException("Invalid token")

        # Normalize Payload JWT to match shape expected by endpoints.
        role = decoded.get("role", "")
        role_scopes = PAYLOAD_ROLE_SCOPES.get(role, [])

        return {
            "sub": str(decoded.get("id", "")),
            "email": decoded.get("email", ""),
            "scope": " ".join(role_scopes),
            "role": role,
            "assignedTags": decoded.get("assignedTags", []),
            "assignedPlaces": decoded.get("assignedPlaces", []),
        }

    async def verify(
        self,
        security_scopes: SecurityScopes,
        token: HTTPAuthorizationCredentials | None = Depends(HTTPBearer()),
    ) -> dict:
        if token is None:
            raise UnauthenticatedException

        payload = self._verify_payload_jwt(token.credentials)

        # Check required scopes
        token_scopes = payload.get("scope", "").split()

        for scope in security_scopes.scopes:
            if scope not in token_scopes:
                raise UnauthorizedException("Insufficient permissions")

        return payload


auth = VerifyToken()


class VerifyRecaptcha:
    """Verifies reCAPTCHA tokens"""

    def __init__(self):
        self.config = get_settings()

    async def verify_recaptcha(self, token: str, host: str):
        """
        Verifies reCAPTCHA tokens

        Args:
            token (str): The reCAPTCHA token to verify
            host (str): The host of the request

        Raises:
            HTTPException: If the reCAPTCHA verification fails

        """
        # Verify reCAPTCHA token
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://www.google.com/recaptcha/api/siteverify",
                data={
                    "secret": self.config.RECAPTCHA_SECRET_KEY,
                    "response": token,
                    "remoteip": host,
                },
            )
        result = response.json()
        if not result.get("success"):
            raise HTTPException(status_code=400, detail="reCAPTCHA verification failed")


recaptcha = VerifyRecaptcha()
