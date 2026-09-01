"""
Tests for the in-Wagtail moderation views and the per-user token bridge.

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

from core.testing import (
    PASSWORD,
    create_mirror_tables,
    make_admin_user,
    make_form_config,
    make_portal,
    make_team,
)
from authapi.serializers import (
    DistrictrTokenObtainPairSerializer,
    mint_user_access_token,
)
from authapi.tests import fastapi_style_verify


def make_entry(**overrides):
    """A minimal SubmissionAdmin payload."""
    entry = {
        "id": 11,
        "portal_id": "midwest-portal",
        "tags": ["midwest-portal", "midwest-tour"],
        "nsfw": False,
        "map_public_id": None,
        "created_at": "2026-08-01T00:00:00",
        "submitted_at": "2026-08-01T00:00:00",
        "status": "submitted",
        "hidden": False,
        "flagged": True,
        "moderation_score": 0.02,
        "fields": {
            "title": "A comment title",
            "comment": "Comment body",
            "first_name": "Pat",
            "last_name": "Lee",
            "email": "pat@example.com",
            "place": "Lansing",
            "state": "MI",
            "zip_code": "48901",
        },
    }
    entry.update(overrides)
    return entry


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
# List views
# ---------------------------------------------------------------------------


class PortalListTests(TestCase):
    def setUp(self):
        from datastore.models import FormConfig

        self.url = reverse("moderation_review_portals")
        create_mirror_tables(FormConfig)
        self.portal_a = make_portal("midwest-portal", districtr_map_slug="chi_wards")
        self.portal_b = make_portal("texas-portal", districtr_map_slug="tx_other")

    def test_admin_sees_all_portals(self):
        admin = make_admin_user(group_name="admin")
        self.client.force_login(admin)
        response = self.client.get(self.url)
        self.assertContains(response, "midwest-portal")
        self.assertContains(response, "texas-portal")

    def test_team_less_partner_sees_nothing(self):
        # Fail closed, matching the backend's teams: [] -> 403 — this list
        # also gates add_to_portal_gallery, a pure CMS write.
        partner = make_admin_user(email="partner@districtr.org", group_name="partner")
        self.client.force_login(partner)
        response = self.client.get(self.url)
        self.assertNotContains(response, "midwest-portal")
        self.assertNotContains(response, "texas-portal")

    def test_team_scoped_partner_sees_only_their_portals(self):
        make_form_config("midwest-portal", admin_teams=["portal-team"])
        make_form_config("texas-portal", admin_teams=["other-team"])
        partner = make_admin_user(email="scoped@districtr.org", group_name="partner")
        make_team("Portal Team", members=[partner])
        self.client.force_login(partner)
        response = self.client.get(self.url)
        self.assertContains(response, "midwest-portal")
        self.assertNotContains(response, "texas-portal")

    def test_groupless_user_denied(self):
        user = make_admin_user(email="lone@districtr.org", group_name="partner")
        user.groups.clear()
        self.client.force_login(user)
        response = self.client.get(self.url)
        self.assertRedirects(response, reverse("wagtailadmin_home"))


class PortalReviewViewTests(TestCase):
    def setUp(self):
        from datastore.models import FormConfig

        create_mirror_tables(FormConfig)
        self.portal = make_portal("midwest-portal")
        self.url = reverse("moderation_portal_review", args=["midwest-portal"])
        self.reviewer = make_admin_user(
            email="reviewer@districtr.org", group_name="partner"
        )
        # Reach comes from admin_teams (fail-closed for team-less partners).
        make_team("Review Team", members=[self.reviewer])
        make_form_config("midwest-portal", admin_teams=["review-team"])
        self.client.login(username="reviewer@districtr.org", password=PASSWORD)

    def test_inaccessible_portal_denied(self):
        response = self.client.get(
            reverse("moderation_portal_review", args=["not-a-portal"])
        )
        self.assertRedirects(response, reverse("wagtailadmin_home"))

    def test_portal_supplies_the_portal_filter(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body=[])
            self.client.get(
                self.url,
                {
                    "status": "submitted",
                    "flagged": "1",
                    "nsfw": "1",
                    "p": "2",
                },
            )
        _, kwargs = request.call_args
        self.assertEqual(
            kwargs["params"],
            {
                "status": "submitted",
                "flagged": "true",
                "nsfw": "true",
                "portal_id": "midwest-portal",
                "offset": 20,
                "limit": 21,
            },
        )
        # The request authenticates as the acting user.
        token = kwargs["headers"]["Authorization"].removeprefix("Bearer ")
        self.assertEqual(fastapi_style_verify(token)["sub"], str(self.reviewer.pk))

    def test_maps_kind_adds_has_map(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body=[])
            self.client.get(self.url, {"kind": "maps"})
        _, kwargs = request.call_args
        self.assertEqual(kwargs["params"].get("has_map"), "true")
        self.assertEqual(kwargs["params"].get("portal_id"), "midwest-portal")

    def test_renders_entries_and_actions(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body=[make_entry()])
            response = self.client.get(self.url)
        self.assertContains(response, "A comment title")
        # A clean, visible entry offers Blur and Hide.
        self.assertContains(response, 'name="action" value="nsfw"')
        self.assertContains(response, 'name="value" value="1"')
        self.assertContains(response, 'name="action" value="hidden"')
        # Private fields reach reviewers.
        self.assertContains(response, "pat@example.com")

    def test_maps_kind_renders_add_to_portal_gallery(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(
                json_body=[make_entry(map_public_id=42)]
            )
            response = self.client.get(self.url, {"kind": "maps"})
        self.assertContains(response, "Submitted plan: #42")
        self.assertContains(response, "Add to portal gallery")

    def test_draft_map_submission_cannot_be_added_to_gallery(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(
                json_body=[make_entry(map_public_id=42, status="draft")]
            )
            response = self.client.get(self.url, {"kind": "maps"})
        self.assertNotContains(response, "Add to portal gallery")

    def test_backend_403_detail_surfaces(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(
                status_code=403, json_body={"detail": "restricted to specific tags"}
            )
            response = self.client.get(self.url)
        self.assertContains(response, "restricted to specific tags")

    def test_pagination_next_link_from_extra_row(self):
        entries = [make_entry(id=i) for i in range(21)]
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body=entries)
            response = self.client.get(self.url)
        self.assertContains(response, "?p=2")
        self.assertNotContains(response, "#20")


# ---------------------------------------------------------------------------
# Submission actions (nsfw / hidden)
# ---------------------------------------------------------------------------


class SubmissionActionTests(TestCase):
    def setUp(self):
        from datastore.models import FormConfig

        self.url = reverse("moderation_submission_action")
        # The action view proxies to the backend, which owns authorization,
        # but its redirect target renders the portal list -> mirror needed.
        create_mirror_tables(FormConfig)
        make_admin_user(email="reviewer@districtr.org", group_name="partner")
        self.client.login(username="reviewer@districtr.org", password=PASSWORD)

    def post(self, data, **kwargs):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body={"id": 11})
            response = self.client.post(self.url, data, **kwargs)
        return response, request

    def test_get_not_allowed(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 405)

    def test_nsfw_action_posts_to_backend(self):
        response, request = self.post({"id": "11", "action": "nsfw", "value": "1"})
        self.assertRedirects(
            response,
            reverse("moderation_review_portals"),
            fetch_redirect_response=False,
        )
        args, kwargs = request.call_args
        self.assertEqual(args[0], "POST")
        self.assertIn("/api/submissions/admin/11/nsfw", args[1])
        self.assertEqual(kwargs["json"], {"nsfw": True})

    def test_hidden_action_posts_to_backend(self):
        _, request = self.post({"id": "11", "action": "hidden", "value": "0"})
        args, kwargs = request.call_args
        self.assertIn("/api/submissions/admin/11/hidden", args[1])
        self.assertEqual(kwargs["json"], {"hidden": False})

    def test_invalid_inputs_are_400(self):
        for data in (
            {"id": "11", "action": "bogus", "value": "1"},
            {"id": "11", "action": "nsfw", "value": "maybe"},
            {"id": "not-a-number", "action": "nsfw", "value": "1"},
            {"action": "nsfw", "value": "1"},
        ):
            response, request = self.post(data)
            self.assertEqual(response.status_code, 400, data)
            request.assert_not_called()

    def test_backend_error_message_and_redirect(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(
                status_code=403, json_body={"detail": "do not administer"}
            )
            response = self.client.post(
                self.url,
                {
                    "id": "11",
                    "action": "hidden",
                    "value": "1",
                    "next": "/admin/moderation/portals/?p=2",
                },
                follow=True,
            )
        self.assertContains(response, "do not administer")

    def test_open_redirect_falls_back_to_index(self):
        response, _ = self.post(
            {
                "id": "11",
                "action": "nsfw",
                "value": "1",
                "next": "https://evil.example/phish",
            }
        )
        self.assertRedirects(
            response,
            reverse("moderation_review_portals"),
            fetch_redirect_response=False,
        )

    def test_safe_next_preserves_filters(self):
        response, _ = self.post(
            {
                "id": "11",
                "action": "nsfw",
                "value": "1",
                "next": "/admin/moderation/portals/?p=2",
            }
        )
        self.assertRedirects(
            response,
            "/admin/moderation/portals/?p=2",
            fetch_redirect_response=False,
        )

    def test_groupless_user_denied(self):
        user = make_admin_user(email="lone@districtr.org", group_name="partner")
        user.groups.clear()
        self.client.force_login(user)
        response, request = self.post({"id": "11", "action": "nsfw", "value": "1"})
        self.assertRedirects(response, reverse("wagtailadmin_home"))
        request.assert_not_called()


# ---------------------------------------------------------------------------
# Map submissions
# ---------------------------------------------------------------------------


class AddToPortalGalleryTests(TestCase):
    def setUp(self):
        self.url = reverse("moderation_add_to_portal_gallery")
        from datastore.models import FormConfig

        create_mirror_tables(FormConfig)
        self.portal = make_portal("midwest-portal")
        self.partner = make_admin_user(
            email="partner@districtr.org", group_name="partner"
        )
        # Moderation reach (admin_teams), not page ownership, is what
        # authorizes gallery pinning.
        make_team("Gallery Team", members=[self.partner])
        make_form_config("midwest-portal", admin_teams=["gallery-team"])
        self.client.login(username="partner@districtr.org", password=PASSWORD)

    def add(self, **overrides):
        data = {"portal": "midwest-portal", "public_id": "42"}
        data.update(overrides)
        return self.client.post(self.url, data)

    def _gallery_ids(self):
        page = self.portal.get_latest_revision_as_object()
        return [
            list(block.value["ids"])
            for block in page.body
            if block.block_type == "plan_gallery"
        ]

    def test_appends_to_new_gallery_block_as_draft(self):
        response = self.add()
        self.assertRedirects(
            response,
            reverse("moderation_review_portals"),
            fetch_redirect_response=False,
        )
        self.portal.refresh_from_db()
        self.assertEqual(self._gallery_ids(), [[42]])
        # Draft revision only: the live page body is untouched.
        self.assertEqual(
            [b for b in self.portal.body if b.block_type == "plan_gallery"], []
        )

    def test_appends_to_existing_gallery_block_in_order(self):
        self.add()
        self.add(public_id="7")
        self.portal.refresh_from_db()
        self.assertEqual(self._gallery_ids(), [[42, 7]])

    def test_duplicate_plan_not_added_twice(self):
        self.add()
        self.add()
        self.portal.refresh_from_db()
        self.assertEqual(self._gallery_ids(), [[42]])

    def test_inaccessible_portal_denied(self):
        response = self.add(portal="not-a-portal")
        self.assertRedirects(response, reverse("wagtailadmin_home"))

    def test_invalid_input_is_400(self):
        self.assertEqual(self.add(public_id="not-a-number").status_code, 400)
        response = self.client.post(self.url, {"public_id": "42"})
        self.assertEqual(response.status_code, 400)

    def test_get_not_allowed(self):
        self.assertEqual(self.client.get(self.url).status_code, 405)


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
