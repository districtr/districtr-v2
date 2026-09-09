"""
JWK construction for the verifying key(s), including the RFC 7638 thumbprint
used as `kid`.

The FastAPI backend verifies our tokens with PyJWT's PyJWKClient, which
selects the signing key by matching the JWT header's `kid` against the JWKS.
SimpleJWT does not emit a `kid` header by default, so authapi.tokens adds
one using the same thumbprint computed here.
"""

import base64
import hashlib
import json
from functools import lru_cache

from django.conf import settings
from jwt.algorithms import RSAAlgorithm


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def jwk_from_public_pem(public_pem: str) -> dict:
    """Build a JWK dict (with RFC 7638 `kid`) from an RSA public key PEM."""
    public_key = RSAAlgorithm(RSAAlgorithm.SHA256).prepare_key(public_pem)
    jwk = json.loads(RSAAlgorithm.to_jwk(public_key))
    # RFC 7638: thumbprint over the lexicographically ordered required members.
    canonical = json.dumps(
        {"e": jwk["e"], "kty": jwk["kty"], "n": jwk["n"]},
        separators=(",", ":"),
        sort_keys=True,
    )
    jwk["kid"] = _b64url(hashlib.sha256(canonical.encode("utf-8")).digest())
    jwk["use"] = "sig"
    jwk["alg"] = "RS256"
    return jwk


@lru_cache(maxsize=1)
def current_jwk() -> dict:
    """JWK for the active verifying key."""
    return jwk_from_public_pem(settings.SIMPLE_JWT["VERIFYING_KEY"])


def current_kid() -> str:
    return current_jwk()["kid"]


def all_jwks() -> list[dict]:
    """Active key plus, during rotation, the next key (JWT_NEXT_VERIFYING_KEY)."""
    keys = [current_jwk()]
    next_pem = getattr(settings, "JWT_NEXT_VERIFYING_KEY", "")
    if next_pem:
        keys.append(jwk_from_public_pem(next_pem))
    return keys
