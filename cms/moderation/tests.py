"""
Tests for the per-user token bridge and the site-settings view — what
remains of the moderation app (review retired; takedown lives in portals/).

The backend is never called: moderation.services' HTTP layer is mocked. Token
tests reuse authapi.tests.fastapi_style_verify so a passing test means the
backend's PyJWKClient-based verifier accepts tokens minted for the acting
user — including the teams claim contract the submission endpoints enforce
against form_configs.admin_teams.
"""

from datetime import datetime
from unittest import mock

import jwt as pyjwt
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from wagtail.users.models import UserProfile

from core.testing import PASSWORD, make_admin_user, make_team
from authapi.serializers import mint_user_access_token
from authapi.tests import fastapi_style_verify


def mock_response(status_code=200, json_body=None):
    response = mock.Mock()
    response.status_code = status_code
    response.ok = status_code < 400
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
        # partner scopes carry no review:review-all, so the backend enforces
        # it against form_configs.admin_teams. (Claim derivation itself is
        # pinned in authapi/tests.)
        user = make_admin_user(email="scoped@districtr.org", group_name="partner")
        make_team("Mint Team", members=[user])
        payload = fastapi_style_verify(mint_user_access_token(user))
        self.assertEqual(payload["teams"], ["mint-team"])
        self.assertNotIn("review:review-all", payload["scope"].split())
        self.assertIn("create:content_review", payload["scope"].split())


# ---------------------------------------------------------------------------
# Site settings
# ---------------------------------------------------------------------------


class SiteSettingsViewTests(TestCase):
    def setUp(self):
        self.url = reverse("moderation_site_settings")
        self.admin = make_admin_user(email="admin@districtr.org", group_name="admin")
        self.client.login(username="admin@districtr.org", password=PASSWORD)

    def post(self, data, **kwargs):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body={})
            response = self.client.post(self.url, data, **kwargs)
        return response, request

    def test_non_admin_denied(self):
        user = make_admin_user(email="partner@districtr.org", group_name="partner")
        self.client.force_login(user)
        response = self.client.get(self.url)
        self.assertRedirects(response, reverse("wagtailadmin_home"))

    def test_get_renders_current_value(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(
                json_body={"under_construction": True, "banner_message": "Down at 9"}
            )
            response = self.client.get(self.url)
        self.assertContains(response, "checked")
        self.assertContains(response, "Down at 9</textarea>")
        self.assertContains(response, 'maxlength="500"')
        # The originals the view diffs against, so saves send only changes.
        self.assertContains(
            response, 'name="original_banner_message" value="Down at 9"'
        )
        self.assertContains(response, 'name="original_under_construction" value="on"')
        self.assertNotContains(response, "<fieldset disabled")
        # The public GET goes out unauthenticated, and fresh: the default is
        # a per-worker snapshot that can lag a save another worker handled.
        _, kwargs = request.call_args
        self.assertEqual(kwargs["headers"], {})
        self.assertEqual(kwargs["params"], {"fresh": "true"})

    def test_get_failure_disables_the_form(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(
                status_code=500, json_body={"detail": "Database error"}
            )
            response = self.client.get(self.url)
        self.assertContains(response, "saving is disabled")
        self.assertContains(response, "<fieldset disabled")

    def test_post_patches_with_admin_token(self):
        response, request = self.post(
            {"under_construction": "on", "banner_message": "Down at 9"}
        )
        self.assertRedirects(response, self.url, fetch_redirect_response=False)
        args, kwargs = request.call_args
        self.assertEqual(args[0], "PATCH")
        self.assertEqual(
            kwargs["json"], {"under_construction": True, "banner_message": "Down at 9"}
        )
        token = kwargs["headers"]["Authorization"].removeprefix("Bearer ")
        self.assertEqual(fastapi_style_verify(token)["sub"], str(self.admin.pk))

    def test_post_unchecked_disables(self):
        _, request = self.post({"original_under_construction": "on"})
        _, kwargs = request.call_args
        self.assertEqual(kwargs["json"], {"under_construction": False})

    def test_post_sends_only_changed_fields(self):
        # Another admin may have changed the banner since this form loaded.
        _, request = self.post(
            {
                "under_construction": "on",
                "banner_message": "Hi",
                "original_banner_message": "Hi",
            }
        )
        _, kwargs = request.call_args
        self.assertEqual(kwargs["json"], {"under_construction": True})

    def test_post_with_no_changes_skips_the_backend(self):
        # Line breaks come back as CRLF from both fields; that isn't a change.
        response, request = self.post(
            {
                "banner_message": "Line 1\r\nLine 2",
                "original_banner_message": "Line 1\nLine 2",
            },
            follow=True,
        )
        self.assertNotIn("PATCH", [call.args[0] for call in request.call_args_list])
        self.assertContains(response, "Nothing changed.")

    def test_get_shows_a_running_countdown(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(
                json_body={
                    "under_construction": False,
                    "banner_message": None,
                    "downtime_at": "2099-01-01T21:10:00+00:00",
                }
            )
            response = self.client.get(self.url)
        self.assertContains(response, "21:10 UTC")
        self.assertContains(response, 'name="cancel_countdown"')
        self.assertNotContains(response, "time's up")

    def test_countdown_shows_in_the_admins_time_zone(self):
        profile = UserProfile.get_for_user(self.admin)
        profile.current_time_zone = "America/New_York"
        profile.save()
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(
                json_body={"downtime_at": "2099-01-01T21:10:00+00:00"}
            )
            response = self.client.get(self.url)
        self.assertContains(response, "16:10 EST")

    def test_get_flags_an_overdue_countdown(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(
                json_body={"downtime_at": "2000-01-01T00:00:00+00:00"}
            )
            response = self.client.get(self.url)
        self.assertContains(response, "time's up")

    def test_post_minutes_sends_an_absolute_downtime(self):
        before = timezone.now()
        _, request = self.post({"downtime_minutes": "10"})
        _, kwargs = request.call_args
        at = datetime.fromisoformat(kwargs["json"]["downtime_at"])
        self.assertAlmostEqual((at - before).total_seconds(), 600, delta=5)
        self.assertEqual(set(kwargs["json"]), {"downtime_at"})

    def test_post_accepts_the_countdown_bounds(self):
        for ok in ("1", "1440"):
            _, request = self.post({"downtime_minutes": ok})
            _, kwargs = request.call_args
            self.assertIn("downtime_at", kwargs["json"])

    def test_post_cancel_clears_the_countdown(self):
        _, request = self.post({"cancel_countdown": "on"})
        _, kwargs = request.call_args
        self.assertEqual(kwargs["json"], {"downtime_at": None})

    def test_post_bad_minutes_is_refused(self):
        for bad in ("0", "-5", "abc", "1441"):
            response, request = self.post({"downtime_minutes": bad}, follow=True)
            self.assertNotIn("PATCH", [call.args[0] for call in request.call_args_list])
            self.assertContains(response, "1 to 1440 minutes")

    def test_post_failure_reports_the_backend_error(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.side_effect = [
                mock_response(
                    status_code=422,
                    json_body={"detail": "String should have at most 500 characters"},
                ),
                mock_response(json_body={"under_construction": False}),
            ]
            response = self.client.post(self.url, {"banner_message": "x"}, follow=True)
        self.assertContains(response, "Saving failed")
        self.assertContains(response, "at most 500 characters")


# ---------------------------------------------------------------------------
# Menu items
# ---------------------------------------------------------------------------
