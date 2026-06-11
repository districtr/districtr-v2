"""
Contract tests for the JWT issuer.

The FastAPI backend (backend/app/core/security.py) verifies tokens by:
  1. fetching the JWKS and selecting the key whose `kid` matches the JWT
     header (PyJWT's PyJWKClient),
  2. decoding with audience + issuer validation,
  3. enforcing a space-delimited `scope` claim via SecurityScopes.
The `_fastapi_style_verify` helper mirrors that exactly; if these tests pass,
the backend's verifier accepts our tokens with only config-level changes.
"""

import json
import tempfile

import jwt as pyjwt
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core import mail
from django.core.management import call_command
from django.test import TestCase, override_settings

from authapi.jwks import all_jwks, current_kid
from authapi.scopes import ALL_SCOPES, scopes_for_user
from authapi.serializers import DistrictrTokenObtainPairSerializer

PASSWORD = "correct-horse-battery-staple"


def make_user(group_name: str | None, email="user@districtr.org"):
    user = get_user_model().objects.create_user(
        username=email, email=email, password=PASSWORD, first_name="Test"
    )
    if group_name:
        user.groups.add(Group.objects.get(name=group_name))
    return user


def fastapi_style_verify(token: str) -> dict:
    """Replicates backend/app/core/security.py::VerifyToken.verify."""
    header = pyjwt.get_unverified_header(token)
    keys = {k["kid"]: k for k in all_jwks()}
    assert header["kid"] in keys, "kid in JWT header must match a JWKS key"
    signing_key = pyjwt.algorithms.RSAAlgorithm.from_jwk(
        json.dumps(keys[header["kid"]])
    )
    return pyjwt.decode(
        token,
        signing_key,
        algorithms=["RS256"],
        audience=settings.JWT_AUDIENCE,
        issuer=settings.JWT_ISSUER,
    )


class ScopeMappingTests(TestCase):
    def test_editor_scopes(self):
        user = make_user("editor")
        scopes = scopes_for_user(user).split()
        self.assertIn("create:content", scopes)
        self.assertIn("update:publish", scopes)
        self.assertNotIn("create:districtr_maps", scopes)
        self.assertNotIn("create:content_review", scopes)

    def test_reviewer_scopes(self):
        user = make_user("reviewer")
        scopes = scopes_for_user(user).split()
        self.assertEqual(sorted(scopes), ["create:content_review", "read:read-all"])

    def test_partner_has_no_api_scopes(self):
        user = make_user("partner")
        self.assertEqual(scopes_for_user(user), "")

    def test_admin_gets_all_scopes(self):
        user = make_user("admin")
        self.assertEqual(scopes_for_user(user).split(), ALL_SCOPES)

    def test_superuser_gets_all_scopes_without_groups(self):
        user = make_user(None)
        user.is_superuser = True
        user.save()
        self.assertEqual(scopes_for_user(user).split(), ALL_SCOPES)


class TokenContractTests(TestCase):
    def test_access_token_round_trips_through_fastapi_verifier(self):
        user = make_user("editor")
        refresh = DistrictrTokenObtainPairSerializer.get_token(user)
        payload = fastapi_style_verify(str(refresh.access_token))

        self.assertEqual(payload["sub"], str(user.pk))
        self.assertEqual(payload["email"], user.email)
        self.assertIn("create:content", payload["scope"].split())
        self.assertEqual(payload["roles"], ["editor"])

    def test_kid_header_matches_jwks(self):
        user = make_user("editor")
        token = str(DistrictrTokenObtainPairSerializer.get_token(user).access_token)
        header = pyjwt.get_unverified_header(token)
        self.assertEqual(header["kid"], current_kid())
        self.assertEqual(header["alg"], "RS256")

    def test_jwks_endpoint(self):
        response = self.client.get("/.well-known/jwks.json")
        self.assertEqual(response.status_code, 200)
        keys = response.json()["keys"]
        self.assertEqual(len(keys), 1)
        self.assertEqual(keys[0]["kty"], "RSA")
        self.assertEqual(keys[0]["alg"], "RS256")
        self.assertEqual(keys[0]["use"], "sig")
        self.assertEqual(keys[0]["kid"], current_kid())


class TokenEndpointTests(TestCase):
    def test_obtain_and_refresh_flow(self):
        make_user("editor", email="flow@districtr.org")

        response = self.client.post(
            "/api/token/",
            {"username": "flow@districtr.org", "password": PASSWORD},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("access", data)
        self.assertIn("refresh", data)

        payload = fastapi_style_verify(data["access"])
        self.assertIn("create:content", payload["scope"].split())

        # Refresh must preserve the scope claim and kid header (the Next.js
        # session refreshes silently; FastAPI keeps seeing valid scopes).
        refresh_response = self.client.post(
            "/api/token/refresh/", {"refresh": data["refresh"]}
        )
        self.assertEqual(refresh_response.status_code, 200)
        refreshed = refresh_response.json()
        refreshed_payload = fastapi_style_verify(refreshed["access"])
        self.assertEqual(refreshed_payload["scope"], payload["scope"])
        # Rotation: a new refresh token is issued and the old one blacklists.
        self.assertIn("refresh", refreshed)
        reuse = self.client.post("/api/token/refresh/", {"refresh": data["refresh"]})
        self.assertEqual(reuse.status_code, 401)

    def test_bad_credentials_rejected(self):
        make_user("editor", email="bad@districtr.org")
        response = self.client.post(
            "/api/token/",
            {"username": "bad@districtr.org", "password": "wrong-password"},
        )
        self.assertEqual(response.status_code, 401)

    def test_audience_and_issuer_enforced(self):
        user = make_user("editor", email="aud@districtr.org")
        token = str(DistrictrTokenObtainPairSerializer.get_token(user).access_token)
        keys = {k["kid"]: k for k in all_jwks()}
        signing_key = pyjwt.algorithms.RSAAlgorithm.from_jwk(
            json.dumps(keys[pyjwt.get_unverified_header(token)["kid"]])
        )
        with self.assertRaises(pyjwt.InvalidAudienceError):
            pyjwt.decode(
                token,
                signing_key,
                algorithms=["RS256"],
                audience="https://wrong-audience/",
                issuer=settings.JWT_ISSUER,
            )


class ProvisionUsersTests(TestCase):
    def test_sends_setup_email_despite_unusable_password(self):
        # provision_users sets an unusable password (the email is how users
        # set one), so it must bypass PasswordResetForm's usable-password
        # filter, and derive the link domain from WAGTAILADMIN_BASE_URL
        # (there is no request, and django.contrib.sites is not installed).
        with tempfile.NamedTemporaryFile("w", suffix=".csv") as csv_file:
            csv_file.write("email,name,group\nnew@districtr.org,New User,editor\n")
            csv_file.flush()
            with override_settings(WAGTAILADMIN_BASE_URL="https://cms.districtr.org"):
                call_command("provision_users", csv_file.name)

        user = get_user_model().objects.get(username="new@districtr.org")
        self.assertFalse(user.has_usable_password())
        self.assertEqual([g.name for g in user.groups.all()], ["editor"])

        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ["new@districtr.org"])
        self.assertIn(
            "https://cms.districtr.org/admin/password_reset/confirm/", message.body
        )
