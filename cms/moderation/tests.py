"""
Tests for the per-user token bridge and the site-settings view — what
remains of the moderation app (review retired; takedown lives in portals/).

The backend is never called: moderation.services' HTTP layer is mocked. Token
tests reuse authapi.tests.fastapi_style_verify so a passing test means the
backend's PyJWKClient-based verifier accepts tokens minted for the acting
user — including the teams claim contract the submission endpoints enforce
against form_configs.admin_teams.
"""

from unittest import mock

import jwt as pyjwt
from django.test import TestCase
from django.urls import reverse

from core.testing import PASSWORD, make_admin_user, make_team
from authapi.serializers import (
    DistrictrTokenObtainPairSerializer,
    mint_user_access_token,
)
from authapi.tests import fastapi_style_verify


def mock_response(status_code=200, json_body=None):
    response = mock.Mock()
    response.status_code = status_code
    response.json.return_value = json_body if json_body is not None else []
    response.text = str(json_body)
    return response


# ---------------------------------------------------------------------------
# Per-user token minting
# ---------------------------------------------------------------------------


class MintUserAccessTokenTests(TestCase):
    def test_round_trips_through_fastapi_verifier(self):
        user = make_admin_user(group_name="admin")
        payload = fastapi_style_verify(mint_user_access_token(user))
        self.assertEqual(payload["sub"], str(user.pk))
        self.assertEqual(payload["roles"], ["admin"])
        scopes = payload["scope"].split()
        self.assertIn("create:content_review", scopes)
        self.assertIn("update:update-all", scopes)

    def test_kid_header_and_algorithm(self):
        from authapi.jwks import current_kid

        token = mint_user_access_token(make_admin_user(group_name="partner"))
        header = pyjwt.get_unverified_header(token)
        self.assertEqual(header["kid"], current_kid())
        self.assertEqual(header["alg"], "RS256")

    def test_team_scoped_reviewer_claims(self):
        # The whole scoping contract: the claim is the user's team slugs, and
        # partner scopes carry no read:read-all, so the backend enforces it
        # against form_configs.admin_teams. (Claim derivation itself is
        # pinned in authapi/tests.)
        user = make_admin_user(email="scoped@districtr.org", group_name="partner")
        make_team("Mint Team", members=[user])
        payload = fastapi_style_verify(mint_user_access_token(user))
        self.assertEqual(payload["teams"], ["mint-team"])
        self.assertNotIn("read:read-all", payload["scope"].split())
        self.assertIn("create:content_review", payload["scope"].split())

    def test_login_path_claims_unchanged_by_refactor(self):
        # Guard the set_user_claims extraction: the login-issued access token
        # carries the same claims as the in-process mint.
        user = make_admin_user(email="both@districtr.org", group_name="partner")
        login_payload = fastapi_style_verify(
            str(DistrictrTokenObtainPairSerializer.get_token(user).access_token)
        )
        minted_payload = fastapi_style_verify(mint_user_access_token(user))
        for claim in ("sub", "scope", "roles", "email", "name"):
            self.assertEqual(login_payload[claim], minted_payload[claim], claim)


# ---------------------------------------------------------------------------
# Site settings
# ---------------------------------------------------------------------------


class SiteSettingsViewTests(TestCase):
    def setUp(self):
        self.url = reverse("moderation_site_settings")
        self.admin = make_admin_user(email="admin@districtr.org", group_name="admin")
        self.client.login(username="admin@districtr.org", password=PASSWORD)

    def test_non_admin_denied(self):
        user = make_admin_user(email="partner@districtr.org", group_name="partner")
        self.client.force_login(user)
        response = self.client.get(self.url)
        self.assertRedirects(response, reverse("wagtailadmin_home"))

    def test_get_renders_current_value(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body={"under_construction": True})
            response = self.client.get(self.url)
        self.assertContains(response, "checked")
        # The public GET goes out unauthenticated.
        _, kwargs = request.call_args
        self.assertEqual(kwargs["headers"], {})

    def test_post_patches_with_admin_token(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body={"under_construction": True})
            response = self.client.post(self.url, {"under_construction": "on"})
        self.assertRedirects(response, self.url, fetch_redirect_response=False)
        args, kwargs = request.call_args
        self.assertEqual(args[0], "PATCH")
        self.assertEqual(kwargs["json"], {"under_construction": True})
        token = kwargs["headers"]["Authorization"].removeprefix("Bearer ")
        self.assertEqual(fastapi_style_verify(token)["sub"], str(self.admin.pk))

    def test_post_unchecked_disables(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(
                json_body={"under_construction": False}
            )
            self.client.post(self.url, {})
        _, kwargs = request.call_args
        self.assertEqual(kwargs["json"], {"under_construction": False})


# ---------------------------------------------------------------------------
# Menu items
# ---------------------------------------------------------------------------
