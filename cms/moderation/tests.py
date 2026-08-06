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
from authapi.test_teams import make_team
from galleries.models import Gallery
from authapi.serializers import (
    DistrictrTokenObtainPairSerializer,
    mint_user_access_token,
)
from authapi.tests import fastapi_style_verify
from datastore.test_admin_tools import PASSWORD, make_admin_user
from moderation import wagtail_hooks


def make_portal(slug, *, districtr_map_slug="chi_wards", title=None):
    """A TagPage under the provisioned tags index (content/0008)."""
    from content.models import TagPage, TagsIndexPage

    index = TagsIndexPage.objects.first()
    portal = TagPage(
        title=title or slug.replace("-", " ").title(),
        slug=slug,
        districtr_map_slug=districtr_map_slug,
    )
    index.add_child(instance=portal)
    return portal


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

        token = mint_user_access_token(make_admin_user(group_name="partner"))
        header = pyjwt.get_unverified_header(token)
        self.assertEqual(header["kid"], current_kid())
        self.assertEqual(header["alg"], "RS256")

    def test_tag_scoped_reviewer_claims(self):
        # The whole scoping contract: assignments emit a sorted review_tags
        # claim and strip read:read-all so the backend enforces it.
        user = make_admin_user(email="scoped@districtr.org", group_name="partner")
        ReviewTagAssignment.objects.create(user=user, tag_slug="b-tour")
        ReviewTagAssignment.objects.create(user=user, tag_slug="a-tour")
        payload = fastapi_style_verify(mint_user_access_token(user))
        self.assertEqual(payload["review_tags"], ["a-tour", "b-tour"])
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
        self.url = reverse("moderation_review_portals")
        self.portal_a = make_portal("midwest-portal", districtr_map_slug="chi_wards")
        self.portal_b = make_portal("texas-portal", districtr_map_slug="tx_other")

    def test_admin_sees_all_portals(self):
        admin = make_admin_user(group_name="admin")
        self.client.force_login(admin)
        response = self.client.get(self.url)
        self.assertContains(response, "midwest-portal")
        self.assertContains(response, "texas-portal")

    def test_unscoped_partner_sees_all_portals(self):
        partner = make_admin_user(email="partner@districtr.org", group_name="partner")
        self.client.force_login(partner)
        response = self.client.get(self.url)
        self.assertContains(response, "midwest-portal")
        self.assertContains(response, "texas-portal")

    def test_team_scoped_partner_sees_only_their_portals(self):
        from authapi.test_teams import create_mirror_tables, make_team
        from datastore.models import DistrictrMap, GerryDBTable

        create_mirror_tables(GerryDBTable, DistrictrMap)
        layer = GerryDBTable.objects.create(name="blocks")
        team_map = DistrictrMap.objects.create(
            name="Chi", districtr_map_slug="chi_wards", parent_layer=layer
        )
        partner = make_admin_user(email="scoped@districtr.org", group_name="partner")
        make_team("Portal Team", members=[partner], maps=[team_map])
        self.client.force_login(partner)
        response = self.client.get(self.url)
        self.assertContains(response, "midwest-portal")
        self.assertNotContains(response, "texas-portal")

    def test_review_tag_assignment_narrows_portals(self):
        partner = make_admin_user(email="tagscoped@districtr.org", group_name="partner")
        ReviewTagAssignment.objects.create(user=partner, tag_slug="texas-portal")
        self.client.force_login(partner)
        response = self.client.get(self.url)
        self.assertNotContains(response, "midwest-portal")
        self.assertContains(response, "texas-portal")

    def test_groupless_user_denied(self):
        user = make_admin_user(email="lone@districtr.org", group_name="partner")
        user.groups.clear()
        self.client.force_login(user)
        response = self.client.get(self.url)
        self.assertRedirects(response, reverse("wagtailadmin_home"))


class PortalReviewViewTests(TestCase):
    def setUp(self):
        self.portal = make_portal("midwest-portal")
        self.url = reverse("moderation_portal_review", args=["midwest-portal"])
        self.reviewer = make_admin_user(
            email="reviewer@districtr.org", group_name="partner"
        )
        self.client.login(username="reviewer@districtr.org", password=PASSWORD)

    def test_inaccessible_portal_denied(self):
        response = self.client.get(
            reverse("moderation_portal_review", args=["not-a-portal"])
        )
        self.assertRedirects(response, reverse("wagtailadmin_home"))

    def test_portal_supplies_the_tag_filter(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body=[])
            self.client.get(
                self.url,
                {
                    "review_status": "APPROVED",
                    "flagged": "1",
                    "comment_id": "9",
                    "p": "2",
                },
            )
        _, kwargs = request.call_args
        self.assertEqual(
            kwargs["params"],
            {
                "review_status": "APPROVED",
                "review_flagged": "true",
                "comment_id": 9,
                "tags": ["midwest-portal"],
                "offset": 20,
                "limit": 21,
            },
        )
        # The request authenticates as the acting user.
        token = kwargs["headers"]["Authorization"].removeprefix("Bearer ")
        self.assertEqual(fastapi_style_verify(token)["sub"], str(self.reviewer.pk))

    def test_maps_kind_adds_has_document(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body=[])
            self.client.get(self.url, {"kind": "maps"})
        _, kwargs = request.call_args
        self.assertEqual(kwargs["params"].get("has_document"), "true")
        self.assertEqual(kwargs["params"].get("tags"), ["midwest-portal"])

    def test_no_tags_form_field(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body=[])
            response = self.client.get(self.url)
        self.assertNotContains(response, 'name="tags"')

    def test_renders_entries_and_actions(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body=[make_entry()])
            response = self.client.get(self.url)
        self.assertContains(response, "A comment title")
        self.assertContains(response, 'name="content_type" value="entry"')
        self.assertContains(response, 'name="content_type" value="commenter"')

    def test_maps_kind_renders_add_to_gallery_for_curators(self):
        from authapi.models import Team
        from galleries.models import Gallery

        Gallery.objects.create(
            title="Drafts",
            slug="drafts",
            team=Team.objects.create(name="T", slug="t"),
        )
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body=[make_entry(public_id=42)])
            response = self.client.get(self.url, {"kind": "maps"})
        self.assertContains(response, "Submitted plan: #42")
        self.assertContains(response, "Add to gallery")

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
        self.assertNotContains(response, "#20")


class TagScopedReviewerUITests(TestCase):
    """A reviewer with ReviewTagAssignment rows may only act on tags — the
    backend 403s whole-entry/commenter actions, so the templates hide those
    controls for them."""

    def setUp(self):
        make_portal("midwest-portal", title="Midwest")
        self.url = reverse("moderation_portal_review", args=["midwest-portal"])
        self.reviewer = make_admin_user(
            email="scoped@districtr.org", group_name="partner"
        )
        ReviewTagAssignment.objects.create(
            user=self.reviewer, tag_slug="midwest-portal"
        )
        self.client.force_login(self.reviewer)

    def get_review_page(self, **params):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body=[make_entry()])
            return self.client.get(self.url, params)

    def test_scoped_reviewer_loses_entry_and_commenter_controls(self):
        response = self.get_review_page()
        self.assertNotContains(response, 'name="content_type" value="entry"')
        self.assertNotContains(response, 'name="content_type" value="commenter"')
        # Tag- and comment-level moderation stays available.
        self.assertContains(response, 'name="content_type" value="tag"')
        self.assertContains(response, 'name="content_type" value="comment"')

    def test_unscoped_reviewer_keeps_all_controls(self):
        unscoped = make_admin_user(email="reviewer@districtr.org", group_name="partner")
        self.client.force_login(unscoped)
        response = self.get_review_page()
        self.assertContains(response, 'name="content_type" value="entry"')
        self.assertContains(response, 'name="content_type" value="commenter"')

    def test_maps_kind_also_hides_scoped_controls(self):
        response = self.get_review_page(kind="maps")
        self.assertNotContains(response, 'name="content_type" value="entry"')
        self.assertNotContains(response, 'name="content_type" value="commenter"')


# ---------------------------------------------------------------------------
# Review action
# ---------------------------------------------------------------------------


class ReviewActionTests(TestCase):
    def setUp(self):
        self.url = reverse("moderation_review_action")
        make_admin_user(email="reviewer@districtr.org", group_name="partner")
        self.client.login(username="reviewer@districtr.org", password=PASSWORD)

    def post(self, data, **kwargs):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body={"message": "ok", "id": 1})
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
            response,
            reverse("moderation_review_portals"),
            fetch_redirect_response=False,
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
            {
                "content_type": "comment",
                "id": "not-a-number",
                "review_status": "APPROVED",
            },
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
                    "next": "/admin/moderation/portals/?p=2",
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
            response,
            reverse("moderation_review_portals"),
            fetch_redirect_response=False,
        )

    def test_safe_next_preserves_filters(self):
        response, _ = self.post(
            {
                "content_type": "comment",
                "id": "11",
                "review_status": "APPROVED",
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
        response, request = self.post(
            {"content_type": "comment", "id": "11", "review_status": "APPROVED"}
        )
        self.assertRedirects(response, reverse("wagtailadmin_home"))
        request.assert_not_called()


# ---------------------------------------------------------------------------
# Map submissions
# ---------------------------------------------------------------------------


class AddToGalleryTests(TestCase):
    def setUp(self):
        self.url = reverse("moderation_add_to_gallery")
        self.partner = make_admin_user(
            email="partner@districtr.org", group_name="partner"
        )
        self.client.login(username="partner@districtr.org", password=PASSWORD)
        self.gallery = Gallery.objects.create(
            title="Drafts", slug="drafts", team=make_team("House Team")
        )

    def add(self, **overrides):
        data = {"gallery": str(self.gallery.pk), "public_id": "42"}
        data.update(overrides)
        return self.client.post(self.url, data)

    def test_adds_entry_as_draft_revision_not_live(self):
        response = self.add()
        self.assertRedirects(
            response,
            reverse("moderation_review_portals"),
            fetch_redirect_response=False,
        )
        self.gallery.refresh_from_db()
        latest = self.gallery.get_latest_revision_as_object()
        self.assertEqual([e.document_public_id for e in latest.entries.all()], [42])
        # The live gallery is untouched — an admin publishes the draft.
        self.assertEqual(self.gallery.entries.count(), 0)

    def test_duplicate_plan_not_added_twice(self):
        self.add()
        self.add()
        self.gallery.refresh_from_db()
        latest = self.gallery.get_latest_revision_as_object()
        self.assertEqual(latest.entries.count(), 1)

    def test_out_of_scope_gallery_denied_for_team_scoped_user(self):
        make_team("Team A", members=[self.partner])
        outside = Gallery.objects.create(
            title="Outside", slug="outside", team=make_team("Team B")
        )
        response = self.add(gallery=str(outside.pk))
        self.assertRedirects(response, reverse("wagtailadmin_home"))
        self.assertIsNone(outside.latest_revision_id)

    def test_invalid_input_is_400(self):
        self.assertEqual(self.add(public_id="not-a-number").status_code, 400)
        self.assertEqual(self.add(gallery="999999").status_code, 302)  # denied
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


class ModerationMenuItemTests(TestCase):
    def request_for(self, user):
        request = RequestFactory().get("/admin/")
        request.user = user
        return request

    def test_review_item_targets_portal_picker(self):
        item = wagtail_hooks.register_review_menu_item()
        self.assertEqual(item.label, "Review")
        self.assertEqual(item.url, reverse("moderation_review_portals"))
        self.assertEqual(item.order, 220)

    def test_visibility_matches_groups(self):
        review_item = wagtail_hooks.register_review_menu_item()
        settings_item = wagtail_hooks.register_site_settings_menu_item()
        for group in ("admin", "partner", "super_partner"):
            user = make_admin_user(email=f"{group}@districtr.org", group_name=group)
            request = self.request_for(user)
            self.assertTrue(review_item.is_shown(request), group)
            self.assertEqual(settings_item.is_shown(request), group == "admin", group)

    def test_hidden_for_groupless_user(self):
        user = make_admin_user(email="lone@districtr.org", group_name="partner")
        user.groups.clear()
        self.assertFalse(
            wagtail_hooks.register_review_menu_item().is_shown(self.request_for(user))
        )

    def test_shown_for_superuser_without_groups(self):
        user = get_user_model().objects.create_superuser(
            username="root@districtr.org",
            email="root@districtr.org",
            password=PASSWORD,
        )
        request = self.request_for(user)
        self.assertTrue(wagtail_hooks.register_review_menu_item().is_shown(request))
        self.assertTrue(
            wagtail_hooks.register_site_settings_menu_item().is_shown(request)
        )

    def test_old_queue_urls_removed(self):
        from django.urls import NoReverseMatch

        for name in ("moderation_comments", "moderation_map_submissions"):
            with self.assertRaises(NoReverseMatch):
                reverse(name)
