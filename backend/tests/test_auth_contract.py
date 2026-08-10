"""
Cross-service auth contract test.

Mints JWTs exactly the way the Districtr CMS issuer does (cms/authapi:
RS256, kid = RFC 7638 thumbprint of the verifying key, claims sub/scope/
email/name/roles plus iss/aud) and asserts that VerifyToken — the real
production verifier — accepts them and enforces scopes.

The mirror of this test lives in cms/authapi/tests.py, which verifies
CMS-issued tokens with a replica of this service's verification logic. The
claim layout asserted here and there must stay identical.
"""

import base64
import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone

import anyio
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.security import HTTPAuthorizationCredentials, SecurityScopes

from app.core.config import get_settings
from app.core.security import (
    UnauthenticatedException,
    UnauthorizedException,
    VerifyToken,
)

settings = get_settings()


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


@pytest.fixture(scope="module")
def keypair():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("ascii")
    public_pem = (
        private_key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode("ascii")
    )
    return private_pem, public_pem


@pytest.fixture(scope="module")
def jwks(keypair):
    """JWKS exactly as cms/authapi/jwks.py builds it (incl. RFC 7638 kid)."""
    _, public_pem = keypair
    public_key = jwt.algorithms.RSAAlgorithm(
        jwt.algorithms.RSAAlgorithm.SHA256
    ).prepare_key(public_pem)
    jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(public_key))
    canonical = json.dumps(
        {"e": jwk["e"], "kty": jwk["kty"], "n": jwk["n"]},
        separators=(",", ":"),
        sort_keys=True,
    )
    jwk["kid"] = _b64url(hashlib.sha256(canonical.encode("utf-8")).digest())
    jwk["use"] = "sig"
    jwk["alg"] = "RS256"
    return {"keys": [jwk]}


@pytest.fixture
def verifier(jwks):
    """Real VerifyToken with its PyJWKClient reading the fixture JWKS.

    Patching fetch_data (not get_signing_key_from_jwt) keeps PyJWKClient's
    kid-matching logic in the loop — the part SimpleJWT doesn't provide by
    default and cms/authapi adds.
    """
    v = VerifyToken()
    v.jwks_client.fetch_data = lambda: jwks
    return v


def mint_token(
    private_pem: str,
    kid: str,
    scope: str = "create:content",
    expired: bool = False,
    review_tags: list[str] | None = None,
    **extra_claims,
) -> str:
    """Replicates cms/authapi token output: claim layout and kid header.

    `review_tags` mirrors the CMS's tag-scoped reviewer claim
    (cms/authapi/serializers.py): present only for users with
    ReviewTagAssignments — None omits the claim, matching the unrestricted
    default.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "token_type": "access",
        "exp": now + (timedelta(minutes=-5) if expired else timedelta(minutes=10)),
        "iat": now - timedelta(minutes=6) if expired else now,
        "jti": uuid.uuid4().hex,
        "user_id": 1,
        "sub": "1",
        "scope": scope,
        "email": "editor@districtr.org",
        "name": "Test Editor",
        "roles": ["editor"],
        "aud": settings.AUTH_AUDIENCE,
        "iss": settings.AUTH_ISSUER,
        **extra_claims,
    }
    if review_tags is not None:
        payload["review_tags"] = review_tags
    return jwt.encode(payload, private_pem, algorithm="RS256", headers={"kid": kid})


def run_verify(verifier, token: str, scopes: list[str]) -> dict:
    async def _go():
        return await verifier.verify(
            SecurityScopes(scopes=scopes),
            HTTPAuthorizationCredentials(scheme="Bearer", credentials=token),
        )

    return anyio.run(_go)


def test_valid_token_with_required_scope(verifier, keypair, jwks):
    private_pem, _ = keypair
    kid = jwks["keys"][0]["kid"]
    token = mint_token(private_pem, kid, scope="create:content update:publish")

    payload = run_verify(verifier, token, ["create:content"])

    assert payload["sub"] == "1"
    assert payload["email"] == "editor@districtr.org"
    assert payload["roles"] == ["editor"]


def test_multiple_required_scopes(verifier, keypair, jwks):
    private_pem, _ = keypair
    kid = jwks["keys"][0]["kid"]
    token = mint_token(private_pem, kid, scope="create:content update:publish")

    payload = run_verify(verifier, token, ["create:content", "update:publish"])
    assert payload["scope"] == "create:content update:publish"


def test_review_tags_claim_round_trips(verifier, keypair, jwks):
    """Tag-scoped reviewer token: the CMS strips read:read-all and mints a
    sorted review_tags claim; the verifier must hand the claim through
    unchanged for allowed_review_tags (app/comments/main.py) to enforce."""
    private_pem, _ = keypair
    kid = jwks["keys"][0]["kid"]
    token = mint_token(
        private_pem,
        kid,
        scope="create:content_review",
        review_tags=["environment", "schools"],
    )

    payload = run_verify(verifier, token, ["create:content_review"])

    assert payload["review_tags"] == ["environment", "schools"]
    assert "read:read-all" not in payload["scope"].split()


def test_review_tags_claim_absent_by_default(verifier, keypair, jwks):
    private_pem, _ = keypair
    kid = jwks["keys"][0]["kid"]
    token = mint_token(private_pem, kid, scope="create:content_review")

    payload = run_verify(verifier, token, ["create:content_review"])

    assert "review_tags" not in payload


def test_missing_scope_rejected(verifier, keypair, jwks):
    private_pem, _ = keypair
    kid = jwks["keys"][0]["kid"]
    token = mint_token(private_pem, kid, scope="read:content")

    with pytest.raises(UnauthorizedException):
        run_verify(verifier, token, ["delete:delete-all"])


def test_no_client_credentials_scope_bypass(verifier, keypair, jwks):
    """The Auth0 gty=client-credentials bypass is gone: service tokens carry
    explicit scopes (cms issue_service_token) and get no special treatment."""
    private_pem, _ = keypair
    kid = jwks["keys"][0]["kid"]
    token = mint_token(private_pem, kid, scope="", gty="client-credentials")

    with pytest.raises(UnauthorizedException):
        run_verify(verifier, token, ["create:content"])


def test_expired_token_rejected(verifier, keypair, jwks):
    private_pem, _ = keypair
    kid = jwks["keys"][0]["kid"]
    token = mint_token(private_pem, kid, expired=True)

    with pytest.raises(UnauthorizedException):
        run_verify(verifier, token, ["create:content"])


def test_wrong_audience_rejected(verifier, keypair, jwks):
    private_pem, _ = keypair
    kid = jwks["keys"][0]["kid"]
    token = mint_token(private_pem, kid, aud="https://someone-else/")

    with pytest.raises(UnauthorizedException):
        run_verify(verifier, token, ["create:content"])


def test_wrong_issuer_rejected(verifier, keypair, jwks):
    private_pem, _ = keypair
    kid = jwks["keys"][0]["kid"]
    token = mint_token(private_pem, kid, iss="https://rogue-issuer.example")

    with pytest.raises(UnauthorizedException):
        run_verify(verifier, token, ["create:content"])


def test_unknown_kid_rejected(verifier, keypair):
    private_pem, _ = keypair
    token = mint_token(private_pem, kid="not-in-the-jwks")

    with pytest.raises(UnauthorizedException):
        run_verify(verifier, token, ["create:content"])


def test_unsigned_token_rejected(verifier, jwks):
    kid = jwks["keys"][0]["kid"]
    rogue_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    rogue_pem = rogue_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("ascii")
    token = mint_token(rogue_pem, kid)

    with pytest.raises(UnauthorizedException):
        run_verify(verifier, token, ["create:content"])


def test_missing_token_rejected(verifier):
    async def _go():
        return await verifier.verify(SecurityScopes(scopes=[]), None)

    with pytest.raises(UnauthenticatedException):
        anyio.run(_go)
