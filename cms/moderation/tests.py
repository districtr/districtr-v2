"""
Tests for the in-Wagtail moderation views and the per-user token bridge.

The backend is never called: moderation.services' HTTP layer is mocked. Token
tests reuse authapi.tests.fastapi_style_verify so a passing test means the
backend's PyJWKClient-based verifier accepts tokens minted for the acting
user — including the review_tags claim contract the moderation endpoints
enforce.
"""

from unittest import mock

import jwt as pyjwt
from django.contrib.auth import get_user_model
from django.test import RequestFactory, TestCase
from django.urls import reverse

from authapi.models import ReviewTagAssignment
from authapi.serializers import DistrictrTokenObtainPairSerializer, mint_user_access_token
from authapi.tests import fastapi_style_verify
from datastore.test_admin_tools import PASSWORD, make_admin_user
from moderation import wagtail_hooks


def make_entry(**overrides):
    """A minimal AdminCommentResponse payload."""
    entry = {
        "comment_id": 11,
        "title": "A comment title",
        "comment": "Comment body",
        "first_name": "Pat",
        "last_name": "Lee",
        "place": "Lansing",
        "state": "MI",
        "zip_code": "48901",
        "tags": ["midwest-tour"],
        "tag_ids": [7],
        "tag_review_status": [None],
        "tag_moderation_score": [0.1],
        "comment_review_status": None,
        "comment_moderation_score": 0.2,
        "comment_review_flagged": True,
        "commenter_id": 5,
        "commenter_review_status": None,
        "commenter_moderation_score": 0.3,
        "zone": None,
        "public_id": None,
        "document_id": None,
        "created_at": "2026-08-01T00:00:00",
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

        token = mint_user_access_token(make_admin_user(group_name="reviewer"))
        header = pyjwt.get_unverified_header(token)
        self.assertEqual(header["kid"], current_kid())
        self.assertEqual(header["alg"], "RS256")

    def test_tag_scoped_reviewer_claims(self):
        # The whole scoping contract: assignments emit a sorted review_tags
        # claim and strip read:read-all so the backend enforces it.
        user = make_admin_user(email="scoped@districtr.org", group_name="reviewer")
        ReviewTagAssignment.objects.create(user=user, tag_slug="b-tour")
        ReviewTagAssignment.objects.create(user=user, tag_slug="a-tour")
        payload = fastapi_style_verify(mint_user_access_token(user))
        self.assertEqual(payload["review_tags"], ["a-tour", "b-tour"])
        self.assertNotIn("read:read-all", payload["scope"].split())
        self.assertIn("create:content_review", payload["scope"].split())

    def test_login_path_claims_unchanged_by_refactor(self):
        # Guard the set_user_claims extraction: the login-issued access token
        # carries the same claims as the in-process mint.
        user = make_admin_user(email="both@districtr.org", group_name="reviewer")
        login_payload = fastapi_style_verify(
            str(DistrictrTokenObtainPairSerializer.get_token(user).access_token)
        )
        minted_payload = fastapi_style_verify(mint_user_access_token(user))
        for claim in ("sub", "scope", "roles", "email", "name"):
            self.assertEqual(login_payload[claim], minted_payload[claim], claim)


# ---------------------------------------------------------------------------
# List views
# ---------------------------------------------------------------------------


class CommentListViewTests(TestCase):
    def setUp(self):
        self.url = reverse("moderation_comments")
        self.reviewer = make_admin_user(
            email="reviewer@districtr.org", group_name="reviewer"
        )
        self.client.login(username="reviewer@districtr.org", password=PASSWORD)

    def test_editor_and_partner_denied(self):
        for group in ("editor", "partner"):
            user = make_admin_user(email=f"{group}@districtr.org", group_name=group)
            self.client.force_login(user)
            response = self.client.get(self.url)
            self.assertRedirects(
                response, reverse("wagtailadmin_home"), msg_prefix=group
            )

    def test_filters_map_to_backend_params(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body=[])
            self.client.get(
                self.url,
                {
                    "review_status": "APPROVED",
                    "flagged": "1",
                    "tags": "one, two",
                    "comment_id": "9",
                    "place": "Lansing",
                    "p": "2",
                },
            )
        _, kwargs = request.call_args
        self.assertEqual(
            kwargs["params"],
            {
                "review_status": "APPROVED",
                "review_flagged": "true",
                "tags": ["one", "two"],
                "comment_id": 9,
                "place": "Lansing",
                "offset": 20,
                "limit": 21,
            },
        )
        # The request authenticates as the acting user.
        token = kwargs["headers"]["Authorization"].removeprefix("Bearer ")
        self.assertEqual(fastapi_style_verify(token)["sub"], str(self.reviewer.pk))

    def test_blank_review_status_is_omitted(self):
        # Omitted review_status means "not yet reviewed" on the backend, so
        # blanks must not be sent.
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body=[])
            self.client.get(self.url)
        _, kwargs = request.call_args
        self.assertEqual(kwargs["params"], {"offset": 0, "limit": 21})

    def test_renders_entries_and_actions(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body=[make_entry()])
            response = self.client.get(self.url)
        self.assertContains(response, "A comment title")
        self.assertContains(response, "midwest-tour")
        self.assertContains(response, 'name="content_type" value="entry"')
        self.assertContains(response, 'name="content_type" value="commenter"')

    def test_backend_403_detail_surfaces(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(
                status_code=403, json_body={"detail": "restricted to specific tags"}
            )
            response = self.client.get(self.url)
        self.assertContains(response, "restricted to specific tags")

    def test_pagination_next_link_from_extra_row(self):
        entries = [make_entry(comment_id=i) for i in range(21)]
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body=entries)
            response = self.client.get(self.url)
        self.assertContains(response, "?p=2")
        # Only PAGE_SIZE rows rendered, not the sentinel 21st.
        self.assertNotContains(response, "#20")

    def test_no_next_link_on_short_page(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body=[make_entry()])
            response = self.client.get(self.url)
        self.assertNotContains(response, "?p=2")


class DistrictCommentListViewTests(TestCase):
    def setUp(self):
        self.url = reverse("moderation_district_comments")
        make_admin_user(email="reviewer@districtr.org", group_name="reviewer")
        self.client.login(username="reviewer@districtr.org", password=PASSWORD)

    def test_defaults_to_flagged_queue(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body=[])
            self.client.get(self.url)
        _, kwargs = request.call_args
        self.assertEqual(
            kwargs["params"], {"review_flagged": "true", "offset": 0, "limit": 21}
        )

    def test_explicit_filters_override_default(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body=[])
            self.client.get(self.url, {"document_id": "abc-uuid", "flagged": ""})
        _, kwargs = request.call_args
        self.assertEqual(
            kwargs["params"], {"document_id": "abc-uuid", "offset": 0, "limit": 21}
        )

    def test_tag_scoped_403_banner(self):
        detail = "district comments are not tagged"
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(
                status_code=403, json_body={"detail": detail}
            )
            response = self.client.get(self.url)
        self.assertContains(response, detail)


# ---------------------------------------------------------------------------
# Review action
# ---------------------------------------------------------------------------


class ReviewActionTests(TestCase):
    def setUp(self):
        self.url = reverse("moderation_review_action")
        make_admin_user(email="reviewer@districtr.org", group_name="reviewer")
        self.client.login(username="reviewer@districtr.org", password=PASSWORD)

    def post(self, data, **kwargs):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(
                json_body={"message": "ok", "id": 1}
            )
            response = self.client.post(self.url, data, **kwargs)
        return response, request

    def test_get_not_allowed(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 405)

    def test_single_comment_action(self):
        response, request = self.post(
            {"content_type": "comment", "id": "11", "review_status": "APPROVED"}
        )
        self.assertRedirects(
            response, reverse("moderation_comments"), fetch_redirect_response=False
        )
        _, kwargs = request.call_args
        self.assertEqual(
            kwargs["json"],
            {"content_type": "comment", "id": 11, "review_status": "APPROVED"},
        )

    def test_entry_fans_out(self):
        _, request = self.post(
            {
                "content_type": "entry",
                "comment_id": "11",
                "commenter_id": "5",
                "tag_ids": "7,8",
                "review_status": "REJECTED",
            }
        )
        bodies = [call.kwargs["json"] for call in request.call_args_list]
        self.assertEqual(
            bodies,
            [
                {"content_type": "comment", "id": 11, "review_status": "REJECTED"},
                {"content_type": "commenter", "id": 5, "review_status": "REJECTED"},
                {"content_type": "tag", "id": 7, "review_status": "REJECTED"},
                {"content_type": "tag", "id": 8, "review_status": "REJECTED"},
            ],
        )

    def test_all_tags_fans_out(self):
        _, request = self.post(
            {"content_type": "tags", "ids": "7,8", "review_status": "REVIEWED"}
        )
        bodies = [call.kwargs["json"] for call in request.call_args_list]
        self.assertEqual(
            bodies,
            [
                {"content_type": "tag", "id": 7, "review_status": "REVIEWED"},
                {"content_type": "tag", "id": 8, "review_status": "REVIEWED"},
            ],
        )

    def test_invalid_inputs_are_400(self):
        for data in (
            {"content_type": "comment", "id": "11", "review_status": "BOGUS"},
            {"content_type": "bogus", "id": "11", "review_status": "APPROVED"},
            {"content_type": "comment", "id": "not-a-number", "review_status": "APPROVED"},
            {"content_type": "comment", "review_status": "APPROVED"},
        ):
            response, _ = self.post(data)
            self.assertEqual(response.status_code, 400, data)

    def test_backend_error_message_and_redirect(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(
                status_code=403, json_body={"detail": "outside that scope"}
            )
            response = self.client.post(
                self.url,
                {
                    "content_type": "tag",
                    "id": "7",
                    "review_status": "APPROVED",
                    "next": "/admin/moderation/comments/?p=2",
                },
                follow=True,
            )
        self.assertContains(response, "outside that scope")

    def test_open_redirect_falls_back_to_index(self):
        response, _ = self.post(
            {
                "content_type": "comment",
                "id": "11",
                "review_status": "APPROVED",
                "next": "https://evil.example/phish",
            }
        )
        self.assertRedirects(
            response, reverse("moderation_comments"), fetch_redirect_response=False
        )

    def test_safe_next_preserves_filters(self):
        response, _ = self.post(
            {
                "content_type": "comment",
                "id": "11",
                "review_status": "APPROVED",
                "next": "/admin/moderation/comments/?p=2&flagged=1",
            }
        )
        self.assertRedirects(
            response,
            "/admin/moderation/comments/?p=2&flagged=1",
            fetch_redirect_response=False,
        )

    def test_editor_denied(self):
        user = make_admin_user(email="editor@districtr.org", group_name="editor")
        self.client.force_login(user)
        response, request = self.post(
            {"content_type": "comment", "id": "11", "review_status": "APPROVED"}
        )
        self.assertRedirects(response, reverse("wagtailadmin_home"))
        request.assert_not_called()


# ---------------------------------------------------------------------------
# Site settings
# ---------------------------------------------------------------------------


class SiteSettingsViewTests(TestCase):
    def setUp(self):
        self.url = reverse("moderation_site_settings")
        self.admin = make_admin_user(email="admin@districtr.org", group_name="admin")
        self.client.login(username="admin@districtr.org", password=PASSWORD)

    def test_non_admin_denied(self):
        user = make_admin_user(email="reviewer@districtr.org", group_name="reviewer")
        self.client.force_login(user)
        response = self.client.get(self.url)
        self.assertRedirects(response, reverse("wagtailadmin_home"))

    def test_get_renders_current_value(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(
                json_body={"under_construction": True}
            )
            response = self.client.get(self.url)
        self.assertContains(response, "checked")
        # The public GET goes out unauthenticated.
        _, kwargs = request.call_args
        self.assertEqual(kwargs["headers"], {})

    def test_post_patches_with_admin_token(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(
                json_body={"under_construction": True}
            )
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


class ModerationMenuItemTests(TestCase):
    def request_for(self, user):
        request = RequestFactory().get("/admin/")
        request.user = user
        return request

    def test_comment_review_item_targets_the_wagtail_view(self):
        item = wagtail_hooks.register_comment_review_menu_item()
        self.assertEqual(item.label, "Comment review")
        self.assertEqual(item.url, reverse("moderation_comments"))
        # Ordered right after Galleries (210).
        self.assertEqual(item.order, 220)

    def test_visibility_matches_group_scopes(self):
        review_item = wagtail_hooks.register_comment_review_menu_item()
        settings_item = wagtail_hooks.register_site_settings_menu_item()
        expected = {
            "admin": {"Comment review", "Frontend settings"},
            "reviewer": {"Comment review"},
            "editor": set(),
            "partner": set(),
        }
        for group, visible_labels in expected.items():
            user = make_admin_user(email=f"{group}@districtr.org", group_name=group)
            request = self.request_for(user)
            shown = {
                item.label
                for item in (review_item, settings_item)
                if item.is_shown(request)
            }
            self.assertEqual(shown, visible_labels, f"wrong menu links for {group}")

    def test_shown_for_superuser_without_groups(self):
        user = get_user_model().objects.create_superuser(
            username="root@districtr.org",
            email="root@districtr.org",
            password=PASSWORD,
        )
        for item in (
            wagtail_hooks.register_comment_review_menu_item(),
            wagtail_hooks.register_site_settings_menu_item(),
        ):
            self.assertTrue(item.is_shown(self.request_for(user)))
