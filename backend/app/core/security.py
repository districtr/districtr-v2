import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import SecurityScopes, HTTPAuthorizationCredentials, HTTPBearer
import httpx

from app.core.config import get_settings


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
    """Does all the token verification using PyJWT"""

    def __init__(self):
        self.config = get_settings()

        # This gets the JWKS from a given URL and does processing so you can
        # use any of the keys available
        jwks_url = f"https://{self.config.AUTH0_DOMAIN}/.well-known/jwks.json"
        self.jwks_client = jwt.PyJWKClient(jwks_url)

    async def verify(
        self,
        security_scopes: SecurityScopes,
        token: HTTPAuthorizationCredentials | None = Depends(HTTPBearer()),
    ) -> dict:
        if token is None:
            raise UnauthenticatedException

        try:
            signing_key = self.jwks_client.get_signing_key_from_jwt(
                token.credentials
            ).key
        except jwt.exceptions.PyJWKClientError as error:
            raise UnauthorizedException(str(error))
        except jwt.exceptions.DecodeError as error:
            raise UnauthorizedException(str(error))

        try:
            payload = jwt.decode(
                token.credentials,
                signing_key,
                algorithms=self.config.AUTH0_ALGORITHMS,  # type: ignore
                audience=self.config.AUTH0_API_AUDIENCE,
                issuer=self.config.AUTH0_ISSUER,
            )
        except Exception as error:
            raise UnauthorizedException(str(error))

        if not payload:
            raise UnauthorizedException("Invalid token")

        if payload.get("gty") == "client-credentials":
            return payload

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
