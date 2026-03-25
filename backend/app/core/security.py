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


# Payload CMS role -> Auth0-style scopes mapping.
# This lets existing scope-based endpoint guards work with Payload JWTs.
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


def _is_payload_jwt(token_str: str) -> bool:
    """Check if a JWT was issued by Payload CMS (HS256, no issuer claim)."""
    try:
        header = jwt.get_unverified_header(token_str)
        return header.get("alg") == "HS256"
    except Exception:
        return False


class VerifyToken:
    """Verifies JWTs from Auth0 or Payload CMS.

    During the transition period, both token types are accepted.
    Payload JWTs are identified by their HS256 algorithm header.
    Auth0 JWTs use RS256 via JWKS.
    """

    def __init__(self):
        self.config = get_settings()

        # Auth0 JWKS client
        jwks_url = f"https://{self.config.AUTH0_DOMAIN}/.well-known/jwks.json"
        self.jwks_client = jwt.PyJWKClient(jwks_url)

    def _verify_payload_jwt(self, token_str: str) -> dict:
        """Verify a Payload CMS JWT (HS256 with raw PAYLOAD_SECRET)."""
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

        # Normalize Payload JWT to match Auth0 shape expected by endpoints.
        # Payload JWTs contain: id, email, role, collection, iat, exp
        role = decoded.get("role", "")
        role_scopes = PAYLOAD_ROLE_SCOPES.get(role, [])

        return {
            "sub": str(decoded.get("id", "")),
            "email": decoded.get("email", ""),
            "scope": " ".join(role_scopes),
            "role": role,
            "_source": "payload",
        }

    def _verify_auth0_jwt(self, token_str: str) -> dict:
        """Verify an Auth0 JWT (RS256 via JWKS)."""
        try:
            signing_key = self.jwks_client.get_signing_key_from_jwt(token_str).key
        except jwt.exceptions.PyJWKClientError as error:
            raise UnauthorizedException(str(error))
        except jwt.exceptions.DecodeError as error:
            raise UnauthorizedException(str(error))

        try:
            payload = jwt.decode(
                token_str,
                signing_key,
                algorithms=self.config.AUTH0_ALGORITHMS,  # type: ignore
                audience=self.config.AUTH0_API_AUDIENCE,
                issuer=self.config.AUTH0_ISSUER,
            )
        except Exception as error:
            raise UnauthorizedException(str(error))

        if not payload:
            raise UnauthorizedException("Invalid token")

        payload["_source"] = "auth0"
        return payload

    async def verify(
        self,
        security_scopes: SecurityScopes,
        token: HTTPAuthorizationCredentials | None = Depends(HTTPBearer()),
    ) -> dict:
        if token is None:
            raise UnauthenticatedException

        # Route to the correct verification strategy based on JWT algorithm
        if _is_payload_jwt(token.credentials):
            payload = self._verify_payload_jwt(token.credentials)
        else:
            payload = self._verify_auth0_jwt(token.credentials)

        # Auth0 client-credentials tokens bypass scope checks
        if payload.get("gty") == "client-credentials":
            return payload

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
