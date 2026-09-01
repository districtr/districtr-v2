"""
Tests for the Portals hub: index scoping, the gallery-as-takedown-surface,
the curated-gallery pin, and the metrics proxy.

The backend is never called: moderation.services' HTTP layer is mocked, with
a URL router so the gallery's two backend calls (submissions + batched
document metadata) get distinct payloads.
"""

from unittest import mock

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


def make_document(public_id, **overrides):
    doc = {
        "public_id": public_id,
        "map_metadata": {"name": f"Plan {public_id}", "draft_status": "ready_to_share"},
        "updated_at": "2026-08-01T00:00:00",
        "document_type": "district",
        "map_module": "Test module",
    }
    doc.update(overrides)
    return doc


def mock_response(status_code=200, json_body=None):
    response = mock.Mock()
    response.status_code = status_code
    response.json.return_value = json_body if json_body is not None else []
    response.text = str(json_body)
    return response


def backend_router(routes, default=None):
    """Side-effect for the requests mock: route by URL substring."""

    def _respond(method, url, **kwargs):
        for fragment, body in routes.items():
            if fragment in url:
                return mock_response(json_body=body)
        return mock_response(json_body=default if default is not None else [])

    return _respond


class PortalsIndexTests(TestCase):
    def setUp(self):
        self.url = reverse("portals_index")
        create_mirror_tables_for_form_config()
        self.portal_a = make_portal("midwest-portal", districtr_map_slug="chi_wards")
        self.portal_b = make_portal("texas-portal", districtr_map_slug="tx_other")
        make_form_config("midwest-portal", admin_teams=["portal-team"])
        make_form_config("texas-portal", admin_teams=["other-team"])

    def test_admin_sees_all_portals_with_links(self):
        self.client.force_login(make_admin_user(group_name="admin"))
        response = self.client.get(self.url)
        self.assertContains(response, "midwest-portal")
        self.assertContains(response, "texas-portal")
        self.assertContains(response, "Gallery")
        self.assertContains(response, "Metrics")
        self.assertContains(response, "Edit form")

    def test_team_less_partner_sees_nothing(self):
        # Fail closed, matching the backend's teams: [] -> 403 — this list
        # also gates add_to_portal_gallery, a pure CMS write.
        partner = make_admin_user(email="partner@districtr.org", group_name="partner")
        self.client.force_login(partner)
        response = self.client.get(self.url)
        self.assertNotContains(response, "midwest-portal")
        self.assertNotContains(response, "texas-portal")

    def test_team_scoped_partner_sees_only_their_portals(self):
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


def create_mirror_tables_for_form_config():
    from datastore.models import FormConfig, FormFieldCustom

    create_mirror_tables(FormConfig, FormFieldCustom)


class PortalGalleryViewTests(TestCase):
    def setUp(self):
        create_mirror_tables_for_form_config()
        self.portal = make_portal("midwest-portal", title="Midwest Portal")
        self.url = reverse("portals_gallery", args=["midwest-portal"])
        self.reviewer = make_admin_user(
            email="reviewer@districtr.org", group_name="partner"
        )
        # Team-less partners fail closed; reach comes from admin_teams.
        make_team("Review Team", members=[self.reviewer])
        make_form_config("midwest-portal", admin_teams=["review-team"])
        self.client.login(username="reviewer@districtr.org", password=PASSWORD)

    def test_inaccessible_portal_denied(self):
        response = self.client.get(reverse("portals_gallery", args=["not-a-portal"]))
        self.assertRedirects(response, reverse("wagtailadmin_home"))

    def test_filters_pass_through_to_backend(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body=[])
            self.client.get(
                self.url, {"status": "submitted", "flagged": "1", "nsfw": "0", "p": "2"}
            )
        _, kwargs = request.call_args
        self.assertEqual(
            kwargs["params"],
            {
                "portal_id": "midwest-portal",
                "status": "submitted",
                "flagged": "true",
                "nsfw": "false",
                "offset": 20,
                "limit": 21,
            },
        )

    def test_renders_entries_actions_and_badges(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.side_effect = backend_router(
                {"/api/submissions/admin": [make_entry()]}
            )
            response = self.client.get(self.url)
        self.assertContains(response, "A comment title")
        # Takedown surface: Blur + Hide on a clean visible entry.
        self.assertContains(response, 'name="action" value="nsfw"')
        self.assertContains(response, 'name="action" value="hidden"')
        # A visitor report shows as a badge.
        self.assertContains(response, "Reported by a visitor")
        # Reviewers see private fields.
        self.assertContains(response, "pat@example.com")

    def test_map_entries_render_thumbnail_and_metadata(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.side_effect = backend_router(
                {
                    "/api/submissions/admin": [make_entry(map_public_id=42)],
                    "/api/documents/list": [make_document(42)],
                }
            )
            response = self.client.get(self.url)
        self.assertContains(response, "/api/document/42/thumbnail")
        self.assertContains(response, "Plan 42")
        self.assertContains(response, "Pin to page gallery")

    def test_draft_map_cannot_be_pinned(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.side_effect = backend_router(
                {
                    "/api/submissions/admin": [
                        make_entry(map_public_id=42, status="draft")
                    ],
                    "/api/documents/list": [make_document(42)],
                }
            )
            response = self.client.get(self.url)
        self.assertNotContains(response, "Pin to page gallery")

    def test_backend_403_detail_surfaces(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(
                status_code=403, json_body={"detail": "do not administer"}
            )
            response = self.client.get(self.url)
        self.assertContains(response, "do not administer")

    def test_pagination_next_link_from_extra_row(self):
        entries = [make_entry(id=i) for i in range(21)]
        with mock.patch("moderation.services.requests.request") as request:
            request.side_effect = backend_router({"/api/submissions/admin": entries})
            response = self.client.get(self.url)
        self.assertContains(response, "?p=2")


class SubmissionActionTests(TestCase):
    def setUp(self):
        # The redirect target (portals index) renders the FormConfig list.
        create_mirror_tables_for_form_config()
        self.url = reverse("portals_submission_action")
        make_admin_user(email="reviewer@districtr.org", group_name="partner")
        self.client.login(username="reviewer@districtr.org", password=PASSWORD)

    def post(self, data, **kwargs):
        with mock.patch("moderation.services.requests.request") as request:
            request.return_value = mock_response(json_body={"id": 11})
            response = self.client.post(self.url, data, **kwargs)
        return response, request

    def test_get_not_allowed(self):
        self.assertEqual(self.client.get(self.url).status_code, 405)

    def test_nsfw_action_posts_to_backend(self):
        response, request = self.post({"id": "11", "action": "nsfw", "value": "1"})
        self.assertRedirects(
            response, reverse("portals_index"), fetch_redirect_response=False
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

    def test_backend_error_message_surfaces(self):
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
                    "next": "/admin/portals/",
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
            response, reverse("portals_index"), fetch_redirect_response=False
        )

    def test_groupless_user_denied(self):
        user = make_admin_user(email="lone@districtr.org", group_name="partner")
        user.groups.clear()
        self.client.force_login(user)
        response, request = self.post({"id": "11", "action": "nsfw", "value": "1"})
        self.assertRedirects(response, reverse("wagtailadmin_home"))
        request.assert_not_called()


class AddToPortalGalleryTests(TestCase):
    def setUp(self):
        create_mirror_tables_for_form_config()
        self.url = reverse("portals_add_to_gallery")
        self.portal = make_portal("midwest-portal")
        partner = make_admin_user(email="partner@districtr.org", group_name="partner")
        # Moderation reach (admin_teams), not page ownership, authorizes
        # gallery pinning — and team-less partners fail closed.
        make_team("Gallery Team", members=[partner])
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
            response, reverse("portals_index"), fetch_redirect_response=False
        )
        self.portal.refresh_from_db()
        self.assertEqual(self._gallery_ids(), [[42]])
        # Draft revision only: the live page body is untouched — pages keep
        # their review workflow even though submissions have none.
        self.assertEqual(
            [b for b in self.portal.body if b.block_type == "plan_gallery"], []
        )

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

    def test_get_not_allowed(self):
        self.assertEqual(self.client.get(self.url).status_code, 405)


class MetricsProxyTests(TestCase):
    def setUp(self):
        from portals import views

        views._METRICS_CACHE.clear()
        create_mirror_tables_for_form_config()
        self.portal = make_portal("midwest-portal")
        reviewer = make_admin_user(email="reviewer@districtr.org", group_name="partner")
        # Team-less partners fail closed; reach comes from admin_teams.
        make_team("Review Team", members=[reviewer])
        make_form_config("midwest-portal", admin_teams=["review-team"])
        self.client.login(username="reviewer@districtr.org", password=PASSWORD)

    def _row_url(self, public_id):
        return reverse("portals_metrics_row", args=["midwest-portal", public_id])

    ENVELOPE = {
        "payload_version": 1,
        "metrics": {
            "assigned_units": {"assigned_count": 4, "total_count": 4},
            "population_deviation": {"top_to_bottom_deviation": 123.0},
            "unassigned_population": {"unassigned_population": 0},
            "contiguous": {"1": True, "2": True, "3": True, "4": False},
        },
        "failed": [],
    }

    def test_foreign_public_id_is_404(self):
        # Membership guard: only maps belonging to this portal's submissions
        # can be queried — no metric-fishing by URL.
        with mock.patch("moderation.services.requests.request") as request:
            request.side_effect = backend_router({"/api/submissions/admin": []})
            response = self.client.get(self._row_url(999))
        self.assertEqual(response.status_code, 404)

    def test_derived_row_shape(self):
        with mock.patch("moderation.services.requests.request") as request:
            request.side_effect = backend_router(
                {
                    "/api/submissions/admin": [make_entry(map_public_id=42)],
                    "/evaluation": self.ENVELOPE,
                    "/api/session": {"token": "session-token"},
                }
            )
            response = self.client.get(self._row_url(42))
        self.assertEqual(response.status_code, 200)
        row = response.json()
        self.assertTrue(row["complete"])
        self.assertEqual(row["assigned_count"], 4)
        self.assertEqual(row["districts_drawn"], 4)
        self.assertEqual(row["top_to_bottom_deviation"], 123.0)
        self.assertFalse(row["all_contiguous"])

    def test_backend_failure_is_502_not_500(self):
        with mock.patch("moderation.services.requests.request") as request:

            def _route(method, url, **kwargs):
                if "/api/submissions/admin" in url:
                    return mock_response(json_body=[make_entry(map_public_id=7)])
                if "/api/session" in url:
                    return mock_response(json_body={"token": "t"})
                return mock_response(status_code=504, json_body={"detail": "timeout"})

            request.side_effect = _route
            response = self.client.get(self._row_url(7))
        self.assertEqual(response.status_code, 502)
