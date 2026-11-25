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
from django.core import mail
from django.core.management import call_command
from django.test import TestCase, override_settings

from authapi.jwks import all_jwks, current_kid
from core.testing import make_user
from authapi.scopes import ALL_SCOPES, scopes_for_user
from authapi.serializers import mint_user_access_token


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
    def test_partner_scopes(self):
        # Submission moderation only — and no review:review-all, which
        # would make the backend treat the token as unrestricted and ignore
        # the teams claim.
        user = make_user("partner")
        self.assertEqual(scopes_for_user(user), "create:content_review")

    def test_super_partner_scopes_match_partner(self):
        # super_partner's extra powers are Django model permissions
        # (authapi/0002_provision_roles), not scopes.
        user = make_user("super_partner")
        self.assertEqual(
            scopes_for_user(user), scopes_for_user(make_user("partner", "p@d.org"))
        )
        self.assertNotIn("create:districtr_maps", scopes_for_user(user).split())

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
        user = make_user("partner")
        payload = fastapi_style_verify(mint_user_access_token(user))

        self.assertEqual(payload["sub"], str(user.pk))
        self.assertEqual(payload["email"], user.email)
        self.assertIn("create:content_review", payload["scope"].split())
        self.assertEqual(payload["roles"], ["partner"])

    def test_kid_header_matches_jwks(self):
        user = make_user("partner")
        token = mint_user_access_token(user)
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


class TeamsClaimTests(TestCase):
    """Team-based moderation scoping: the `teams` claim is minted from the
    user's team slugs; the backend intersects it with a portal's
    form_configs.admin_teams (backend/app/submissions/main.py).

    The backend FAILS CLOSED on an absent claim (only `review:review-all`
    bypasses the restriction — see require_portal_admin), and an EMPTY list
    allows nothing, so these tests pin: admins get no claim plus the bypass
    scope; team-scoped users get their team slugs; team-less non-admins get
    [] (fail closed until they join a team).
    """

    def _claim_for(self, user):
        return fastapi_style_verify(mint_user_access_token(user))

    def test_team_scoped_user_gets_team_slugs(self):
        from core.testing import make_team

        user = make_user("partner")
        make_team("Claim Team", members=[user])
        make_team("Other Team")  # not a member — must not appear

        payload = self._claim_for(user)
        self.assertEqual(payload["teams"], ["claim-team"])
        self.assertNotIn("review:review-all", payload["scope"].split())

    def test_team_less_partner_fails_closed(self):
        payload = self._claim_for(make_user("partner"))
        self.assertEqual(payload["teams"], [])

    def test_admin_gets_no_claim(self):
        payload = self._claim_for(make_user("admin"))
        self.assertNotIn("teams", payload)
        self.assertIn("review:review-all", payload["scope"].split())

    def test_superuser_gets_no_claim(self):
        user = make_user(None)
        user.is_superuser = True
        user.save()
        payload = self._claim_for(user)
        self.assertNotIn("teams", payload)

    def test_partner_scope_has_no_review_all(self):
        # review:review-all would make the backend ignore the teams claim.
        self.assertNotIn("review:review-all", scopes_for_user(make_user("partner")))


class TokenAudienceTests(TestCase):
    def test_audience_and_issuer_enforced(self):
        user = make_user("partner", email="aud@districtr.org")
        token = mint_user_access_token(user)
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
            csv_file.write("email,name,group\nnew@districtr.org,New User,partner\n")
            csv_file.flush()
            with override_settings(WAGTAILADMIN_BASE_URL="https://cms.districtr.org"):
                call_command("provision_users", csv_file.name)

        user = get_user_model().objects.get(username="new@districtr.org")
        self.assertFalse(user.has_usable_password())
        self.assertEqual([g.name for g in user.groups.all()], ["partner"])

        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ["new@districtr.org"])
        self.assertIn(
            "https://cms.districtr.org/admin/password_reset/confirm/", message.body
        )


@override_settings(FRONTEND_URL="https://app.example/")
class ExtractTokenTests(TestCase):
    URL = "/api/extract-token/"

    def _get(self, user=None):
        if user is not None:
            self.client.force_login(user)
        return self.client.get(self.URL)

    def assert_cors(self, response):
        self.assertEqual(response["Access-Control-Allow-Origin"], "https://app.example")
        self.assertEqual(response["Access-Control-Allow-Credentials"], "true")

    def test_signed_out_is_401_with_cors(self):
        # CORS headers on errors too, so the app can read why and show sign-in.
        response = self._get()
        self.assertEqual(response.status_code, 401)
        self.assert_cors(response)

    def test_partner_is_403(self):
        self.assertEqual(self._get(make_user("partner")).status_code, 403)

    def test_data_user_and_admin_get_a_purpose_token(self):
        for i, group in enumerate(("data_user", "admin")):
            response = self._get(make_user(group, f"{group}{i}@districtr.org"))
            self.assertEqual(response.status_code, 200)
            self.assert_cors(response)
            token = response.json()["token"]
            keys = {k["kid"]: k for k in all_jwks()}
            key = pyjwt.algorithms.RSAAlgorithm.from_jwk(
                json.dumps(keys[pyjwt.get_unverified_header(token)["kid"]])
            )
            claims = pyjwt.decode(
                token,
                key,
                algorithms=["RS256"],
                audience="districtr:extract",
                issuer=settings.JWT_ISSUER,
            )
            self.assertEqual(claims["scope"], "create:extract")
            # The FastAPI backend must reject it: the token reaches browser JS.
            with self.assertRaises(pyjwt.InvalidAudienceError):
                fastapi_style_verify(token)

    def test_menu_and_dashboard_link_for_data_user_only(self):
        self.client.force_login(make_user("data_user"))
        html = self.client.get("/admin/").content.decode()
        self.assertIn("https://app.example/extract", html)
        self.assertNotIn("Portals", html)

        self.client.force_login(make_user("partner", "p2@districtr.org"))
        html = self.client.get("/admin/").content.decode()
        self.assertNotIn("https://app.example/extract", html)
