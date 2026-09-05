import logging
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, Header, HTTPException, Request, status
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
    # Explicit bypass of per-reviewer tag scoping (the `review_tags` claim).
    # Deliberately separate from read:read-all: the *-all read/update/delete
    # scopes govern access across CMS authorship boundaries, while this one
    # widens moderation reach.
    review_all_content = "review:review-all"


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
        self.jwks_client = jwt.PyJWKClient(self.config.AUTH_JWKS_URL)

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
                algorithms=self.config.AUTH_ALGORITHMS.split(","),
                audience=self.config.AUTH_AUDIENCE,
                issuer=self.config.AUTH_ISSUER,
            )
        except Exception as error:
            raise UnauthorizedException(str(error))

        if not payload:
            raise UnauthorizedException("Invalid token")

        token_scopes = payload.get("scope", "").split()

        for scope in security_scopes.scopes:
            if scope not in token_scopes:
                raise UnauthorizedException("Insufficient permissions")

        return payload


auth = VerifyToken()


def client_ip_from_request(request: Request) -> str | None:
    """Best-effort real client IP for use as Turnstile's `remoteip`.

    Behind the ALB, request.client is the LB node. The ALB appends the IP it
    saw at the TCP layer to the END of X-Forwarded-For; earlier entries are
    client-supplied and spoofable, so trust only the last one. (Revisit if a
    CDN/proxy is ever added in front of the ALB.)
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.rsplit(",", 1)[-1].strip()
    return request.client.host if request.client else None


async def _turnstile_siteverify(secret: str | None, token: str, ip: str | None) -> bool:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={"secret": secret, "response": token, "remoteip": ip},
        )
    return bool(response.json().get("success"))


class VerifyTurnstile:
    """Verifies Cloudflare Turnstile tokens from the comment-form widget"""

    def __init__(self):
        self.config = get_settings()

    async def verify_turnstile(self, token: str, host: str | None):
        """Raises HTTPException 400 when Turnstile rejects the token."""
        if not await _turnstile_siteverify(
            self.config.TURNSTILE_SECRET_KEY, token, host
        ):
            raise HTTPException(status_code=400, detail="captcha verification failed")


turnstile = VerifyTurnstile()


async def verify_session_turnstile(token: str, ip: str | None) -> None:
    """Verify a token from the invisible session Turnstile widget.

    Separate widget/secret from the comment form, so a token minted for one
    can't be replayed against the other. Raises HTTPException 400 on failure.
    """
    if not await _turnstile_siteverify(
        get_settings().TURNSTILE_SESSION_SECRET_KEY, token, ip
    ):
        raise HTTPException(status_code=400, detail="captcha verification failed")


# Audience claim distinguishing session tokens from other JWTs signed with
# SECRET_KEY (e.g. share tokens, which have no aud and never expire).
SESSION_AUDIENCE = "districtr:session"


def mint_session_token() -> tuple[str, datetime]:
    """Mint a stateless HMAC-signed session token and its expiry."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=settings.SESSION_TOKEN_TTL_HOURS)
    token = jwt.encode(
        {"iat": now, "exp": expires_at, "aud": SESSION_AUDIENCE},
        settings.SECRET_KEY,
        algorithm="HS256",
    )
    return token, expires_at


def require_session(
    x_districtr_session: str | None = Header(None, alias="X-Districtr-Session"),
) -> None:
    """FastAPI dependency: require a valid session token (or research API key).

    Stateless — verifies the HMAC signature only, no DB access. When
    SESSION_ENFORCE is false, missing/invalid tokens only log a warning.
    """
    settings = get_settings()
    if (
        settings.RESEARCH_API_KEY
        and x_districtr_session
        and secrets.compare_digest(x_districtr_session, settings.RESEARCH_API_KEY)
    ):
        return
    if x_districtr_session:
        try:
            jwt.decode(
                x_districtr_session,
                settings.SECRET_KEY,
                algorithms=["HS256"],
                audience=SESSION_AUDIENCE,
                options={"require": ["exp", "aud"]},
            )
            return
        except jwt.InvalidTokenError:
            pass
    if settings.SESSION_ENFORCE:
        raise HTTPException(status_code=401, detail="session_required")
    logger.warning("Missing or invalid session token")
