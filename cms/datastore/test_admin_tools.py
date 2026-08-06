"""
Tests for the Wagtail admin bridge to the FastAPI backend: service tokens,
GeoPackage staging to object storage, import scheduling, and the admin tool
views (permission gating + mocked service orchestration).

The backend itself is never called: requests/boto3 are mocked. Token tests
reuse authapi.tests.fastapi_style_verify so a passing test means the
backend's PyJWKClient-based verifier accepts our service tokens.

The thumbnail view tests need the DistrictrMap mirror table (its dropdown
queries it), which does not exist in the Django test database — setUp
creates it inside the per-test transaction (same pattern as content/tests.py
uses for the legacy cms schema).
"""

from unittest import mock

import jwt as pyjwt
from django.core.exceptions import ImproperlyConfigured
from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse

from authapi.models import Team, TeamDistrictrMap
from authapi.tests import fastapi_style_verify
from core.testing import PASSWORD, make_admin_user
from datastore import services
from datastore.models import (
    DistrictrMap,
    DistrictrMapOverlays,
    DistrictrMapsToGroups,
    GerryDBTable,
    MapGroup,
    Overlay,
)
from datastore.services import BackendAPIError


# ---------------------------------------------------------------------------
# Services
# ---------------------------------------------------------------------------


class MintServiceTokenTests(SimpleTestCase):
    def test_round_trips_through_fastapi_verifier(self):
        token = services.mint_service_token(["create:districtr_maps"])
        payload = fastapi_style_verify(token)
        self.assertEqual(payload["sub"], "service:cms-admin")
        self.assertEqual(payload["scope"], "create:districtr_maps")

    def test_kid_header_and_algorithm(self):
        from authapi.jwks import current_kid

        token = services.mint_service_token(["create:content"])
        header = pyjwt.get_unverified_header(token)
        self.assertEqual(header["kid"], current_kid())
        self.assertEqual(header["alg"], "RS256")

    def test_scopes_are_space_delimited_and_lifetime_applied(self):
        token = services.mint_service_token(
            ["create:districtr_maps", "create:content"], lifetime_minutes=5
        )
        payload = fastapi_style_verify(token)
        self.assertEqual(payload["scope"], "create:districtr_maps create:content")
        self.assertEqual(payload["exp"] - payload["iat"], 5 * 60)


@override_settings(
    AWS_ACCESS_KEY_ID="key",
    AWS_SECRET_ACCESS_KEY="secret",
    GPKG_BUCKET="test-bucket",
    AWS_S3_ENDPOINT="",
)
class S3ClientTests(SimpleTestCase):
    @mock.patch("datastore.services.boto3.client")
    def test_plain_s3_when_no_endpoint_configured(self, boto3_client):
        services.get_s3_client()
        boto3_client.assert_called_once_with(
            service_name="s3",
            aws_access_key_id="key",
            aws_secret_access_key="secret",
        )

    @override_settings(AWS_S3_ENDPOINT="https://minio.local:9000")
    @mock.patch("datastore.services.boto3.client")
    def test_custom_endpoint_used_when_configured(self, boto3_client):
        services.get_s3_client()
        kwargs = boto3_client.call_args.kwargs
        self.assertEqual(kwargs["endpoint_url"], "https://minio.local:9000")
        self.assertNotIn("region_name", kwargs)

    @override_settings(AWS_ACCESS_KEY_ID="")
    def test_missing_credentials_raise(self):
        with self.assertRaises(ImproperlyConfigured):
            services.get_s3_client()


@override_settings(
    AWS_ACCESS_KEY_ID="key",
    AWS_SECRET_ACCESS_KEY="secret",
    GPKG_BUCKET="test-bucket",
)
class UploadGpkgTests(SimpleTestCase):
    @mock.patch("datastore.services.get_s3_client")
    def test_uploads_under_prefix_and_returns_s3_path(self, get_client):
        file_obj = mock.Mock()
        path = services.upload_gpkg(file_obj, "20260610-co_blocks.gpkg")
        self.assertEqual(
            path, "s3://test-bucket/gerrydb-uploads/20260610-co_blocks.gpkg"
        )
        get_client.return_value.upload_fileobj.assert_called_once_with(
            file_obj, "test-bucket", "gerrydb-uploads/20260610-co_blocks.gpkg"
        )

    @override_settings(GPKG_BUCKET="")
    def test_missing_bucket_raises(self):
        with self.assertRaises(ImproperlyConfigured):
            services.upload_gpkg(mock.Mock(), "x.gpkg")


@override_settings(BACKEND_API_URL="http://backend:8000")
class ScheduleImportTests(SimpleTestCase):
    @mock.patch("datastore.services.requests.post")
    def test_posts_json_with_bearer_token(self, post):
        post.return_value = mock.Mock(
            status_code=202,
            json=mock.Mock(return_value={"status": "scheduled", "layer": "co_blocks"}),
        )
        result = services.schedule_import(
            "s3://test-bucket/gerrydb-uploads/co.gpkg",
            "co_blocks",
            table_name="co_blocks_v2",
            rm=True,
        )

        self.assertEqual(result, {"status": "scheduled", "layer": "co_blocks"})
        post.assert_called_once()
        args, kwargs = post.call_args
        self.assertEqual(args[0], "http://backend:8000/api/admin/gerrydb/import")
        self.assertEqual(
            kwargs["json"],
            {
                "gpkg": "s3://test-bucket/gerrydb-uploads/co.gpkg",
                "layer": "co_blocks",
                "table_name": "co_blocks_v2",
                "rm": True,
            },
        )
        authorization = kwargs["headers"]["Authorization"]
        self.assertTrue(authorization.startswith("Bearer "))
        payload = fastapi_style_verify(authorization.removeprefix("Bearer "))
        self.assertEqual(payload["sub"], "service:cms-admin")
        self.assertEqual(payload["scope"], "create:districtr_maps")

    @mock.patch("datastore.services.requests.post")
    def test_non_202_raises_with_status_and_body(self, post):
        post.return_value = mock.Mock(status_code=401, text="Unauthorized")
        with self.assertRaises(BackendAPIError) as ctx:
            services.schedule_import("s3://b/k.gpkg", "co_blocks")
        self.assertIn("401", str(ctx.exception))
        self.assertIn("Unauthorized", str(ctx.exception))

    @mock.patch("datastore.services.requests.post")
    def test_map_thumbnail_posts_with_create_content_scope(self, post):
        post.return_value = mock.Mock(
            status_code=200, json=mock.Mock(return_value={"message": "ok"})
        )
        services.regenerate_map_thumbnail("co_demo")
        args, kwargs = post.call_args
        self.assertEqual(args[0], "http://backend:8000/api/gerrydb/co_demo/thumbnail")
        payload = fastapi_style_verify(
            kwargs["headers"]["Authorization"].removeprefix("Bearer ")
        )
        self.assertEqual(payload["scope"], "create:content")

    @mock.patch("datastore.services.requests.post")
    def test_document_thumbnail_non_200_raises(self, post):
        post.return_value = mock.Mock(status_code=404, text="Document not found")
        with self.assertRaises(BackendAPIError):
            services.regenerate_document_thumbnail("abc123")


# ---------------------------------------------------------------------------
# Form validation
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------


class ToolAccessTests(TestCase):
    """super_partner runs the map-module tools (create/compose, upload
    overlay); partners hold no datastore permissions and are denied; anonymous
    users bounce to login. (GPKG import was removed from the admin UI
    2026-08-06 — raw data uploads are deferred.)"""

    def setUp(self):
        # The tool forms' dropdowns query the managed=False mirrors, which
        # need real tables inside the test transaction.
        with connection.schema_editor() as editor:
            editor.create_model(GerryDBTable)
            editor.create_model(DistrictrMap)
            editor.create_model(MapGroup)
            editor.create_model(Overlay)
        make_admin_user(email="super@districtr.org", group_name="super_partner")
        self.client.login(username="super@districtr.org", password=PASSWORD)

    def test_compose_and_overlay_tools_allowed(self):
        for name in ("datastore_compose_map", "datastore_upload_overlay"):
            response = self.client.get(reverse(name))
            self.assertEqual(response.status_code, 200, name)

    def test_anonymous_is_redirected_to_login(self):
        self.client.logout()
        response = self.client.get(reverse("datastore_compose_map"))
        self.assertEqual(response.status_code, 302)
        self.assertIn(reverse("wagtailadmin_login"), response.url)

    def test_partner_without_datastore_permission_is_denied(self):
        make_admin_user(email="partner@districtr.org", group_name="partner")
        self.client.login(username="partner@districtr.org", password=PASSWORD)
        response = self.client.get(reverse("datastore_compose_map"))
        self.assertRedirects(response, reverse("wagtailadmin_home"))


class MapDeleteGuardTests(TestCase):
    """Deleting a DistrictrMap that has saved plans is denied with a
    friendly message — the document.document FK would otherwise hard-block
    the delete as an unhandled IntegrityError (500)."""

    def setUp(self):
        with connection.schema_editor() as editor:
            editor.create_model(GerryDBTable)
            editor.create_model(DistrictrMap)
        with connection.cursor() as cursor:
            cursor.execute("CREATE SCHEMA IF NOT EXISTS document")
            cursor.execute(
                "CREATE TABLE document.document "
                "(document_id uuid, districtr_map_slug varchar)"
            )
        table = GerryDBTable.objects.create(name="co_blocks")
        self.with_plans = DistrictrMap.objects.create(
            name="Alaska", districtr_map_slug="with_plans", parent_layer=table
        )
        self.without_plans = DistrictrMap.objects.create(
            name="Kansas", districtr_map_slug="no_plans", parent_layer=table
        )
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO document.document "
                "VALUES (gen_random_uuid(), 'with_plans')"
            )
        make_admin_user()
        self.client.login(username="dataops@districtr.org", password=PASSWORD)

    def delete_url(self, instance):
        return reverse(
            "wagtailsnippets_datastore_districtrmap:delete", args=[instance.pk]
        )

    def test_single_delete_with_plans_denied(self):
        response = self.client.post(self.delete_url(self.with_plans), follow=True)
        self.assertContains(response, "with_plans (1 plan)")
        self.assertTrue(DistrictrMap.objects.filter(pk=self.with_plans.pk).exists())

    def test_bulk_delete_with_plans_denied(self):
        response = self.client.post(
            "/admin/bulk/datastore/districtrmap/delete/"
            f"?id={self.with_plans.pk}&id={self.without_plans.pk}",
            follow=True,
        )
        self.assertContains(response, "with_plans (1 plan)")
        self.assertEqual(DistrictrMap.objects.count(), 2)

    def test_delete_without_plans_proceeds(self):
        response = self.client.post(self.delete_url(self.without_plans))
        self.assertEqual(response.status_code, 302)
        self.assertFalse(DistrictrMap.objects.filter(pk=self.without_plans.pk).exists())


def create_map_mirrors():
    """The DistrictrMap mirror tables the edit page touches, created inside
    the per-test transaction."""
    with connection.schema_editor() as editor:
        for model in (
            GerryDBTable,
            DistrictrMap,
            MapGroup,
            Overlay,
            DistrictrMapsToGroups,
            DistrictrMapOverlays,
        ):
            editor.create_model(model)


class RegenerateMapThumbnailViewTests(TestCase):
    """The per-map "Regenerate thumbnail" button on the map edit page."""

    def setUp(self):
        create_map_mirrors()
        table = GerryDBTable.objects.create(name="co_blocks")
        self.districtr_map = DistrictrMap.objects.create(
            name="Colorado",
            districtr_map_slug="co_demo",
            parent_layer=table,
        )
        make_admin_user()
        self.client.login(username="dataops@districtr.org", password=PASSWORD)
        self.url = reverse(
            "datastore_map_regenerate_thumbnail", args=[self.districtr_map.pk]
        )
        self.edit_url = reverse(
            "wagtailsnippets_datastore_districtrmap:edit", args=[self.districtr_map.pk]
        )

    def test_get_not_allowed(self):
        self.assertEqual(self.client.get(self.url).status_code, 405)

    def test_post_schedules_and_redirects_to_edit_page(self):
        with mock.patch(
            "datastore.services.regenerate_map_thumbnail",
            return_value={"message": "ok"},
        ) as regenerate:
            response = self.client.post(self.url, follow=True)
        regenerate.assert_called_once_with("co_demo")
        self.assertRedirects(response, self.edit_url)
        self.assertContains(response, "Thumbnail regeneration scheduled")

    def test_partner_denied(self):
        make_admin_user(email="partner@districtr.org", group_name="partner")
        self.client.login(username="partner@districtr.org", password=PASSWORD)
        with mock.patch("datastore.services.regenerate_map_thumbnail") as regenerate:
            response = self.client.post(self.url)
        regenerate.assert_not_called()
        self.assertRedirects(response, reverse("wagtailadmin_home"))

    def test_super_partner_allowed(self):
        make_admin_user(email="super@districtr.org", group_name="super_partner")
        self.client.login(username="super@districtr.org", password=PASSWORD)
        with mock.patch(
            "datastore.services.regenerate_map_thumbnail",
            return_value={"message": "ok"},
        ) as regenerate:
            self.client.post(self.url)
        regenerate.assert_called_once_with("co_demo")

    def test_missing_map_is_404(self):
        url = reverse(
            "datastore_map_regenerate_thumbnail",
            args=["00000000-0000-0000-0000-000000000000"],
        )
        self.assertEqual(self.client.post(url).status_code, 404)

    def test_backend_error_is_surfaced(self):
        with mock.patch(
            "datastore.services.regenerate_map_thumbnail",
            side_effect=BackendAPIError("Backend rejected the thumbnail request"),
        ):
            response = self.client.post(self.url, follow=True)
        self.assertRedirects(response, self.edit_url)
        self.assertContains(response, "Thumbnail regeneration failed")


class DistrictrMapEditViewTests(TestCase):
    """The single-view map management page: the map form plus the overlay /
    map-group / team link formsets (datastore/wagtail_hooks.py)."""

    def setUp(self):
        create_map_mirrors()
        self.table = GerryDBTable.objects.create(name="co_blocks")
        self.districtr_map = DistrictrMap.objects.create(
            name="Colorado",
            districtr_map_slug="co_demo",
            parent_layer=self.table,
        )
        self.overlay = Overlay.objects.create(
            name="Cities", data_type="geojson", layer_type="fill"
        )
        self.group = MapGroup.objects.create(slug="states", name="States")
        self.team = Team.objects.create(name="League", slug="league")
        make_admin_user()
        self.client.login(username="dataops@districtr.org", password=PASSWORD)
        self.url = reverse(
            "wagtailsnippets_datastore_districtrmap:edit", args=[self.districtr_map.pk]
        )

    def form_data(self, **overrides):
        """A valid edit POST: the mapped fields plus empty link formsets."""
        data = {
            "name": "Colorado",
            "districtr_map_slug": "co_demo",
            "map_type": "default",
            # parent_layer is a to_field="name" FK, so the form value is the
            # GerryDBTable name, not a pk.
            "parent_layer": "co_blocks",
            "num_districts_modifiable": "on",
            "visible": "on",
        }
        for prefix in ("overlay_links", "group_links", "team_links"):
            data.update(
                {
                    f"{prefix}-TOTAL_FORMS": "1",
                    f"{prefix}-INITIAL_FORMS": "0",
                    f"{prefix}-MIN_NUM_FORMS": "0",
                    f"{prefix}-MAX_NUM_FORMS": "1000",
                }
            )
        data.update(overrides)
        return data

    def test_admin_sees_all_manage_sections_and_thumbnail_button(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Attached overlays")
        self.assertContains(response, "Map-group listings")
        self.assertContains(response, "Team assignments")
        self.assertContains(response, "Regenerate thumbnail")
        self.assertContains(
            response,
            reverse("datastore_map_regenerate_thumbnail", args=[self.districtr_map.pk]),
        )

    def test_super_partner_does_not_see_team_section(self):
        make_admin_user(email="super@districtr.org", group_name="super_partner")
        self.client.login(username="super@districtr.org", password=PASSWORD)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Attached overlays")
        self.assertNotContains(response, "Team assignments")

    def test_save_adds_overlay_group_and_team_links(self):
        response = self.client.post(
            self.url,
            self.form_data(
                **{
                    "overlay_links-0-overlay": str(self.overlay.pk),
                    "group_links-0-group": self.group.pk,
                    "team_links-0-team": str(self.team.pk),
                }
            ),
        )
        self.assertEqual(response.status_code, 302)
        self.assertTrue(
            DistrictrMapOverlays.objects.filter(
                districtr_map=self.districtr_map, overlay=self.overlay
            ).exists()
        )
        self.assertTrue(
            DistrictrMapsToGroups.objects.filter(
                districtrmap=self.districtr_map, group=self.group
            ).exists()
        )
        self.assertTrue(
            TeamDistrictrMap.objects.filter(
                districtr_map=self.districtr_map, team=self.team
            ).exists()
        )

    def test_super_partner_team_data_is_ignored(self):
        make_admin_user(email="super@districtr.org", group_name="super_partner")
        self.client.login(username="super@districtr.org", password=PASSWORD)
        response = self.client.post(
            self.url,
            self.form_data(
                **{
                    "overlay_links-0-overlay": str(self.overlay.pk),
                    "team_links-0-team": str(self.team.pk),
                }
            ),
        )
        self.assertEqual(response.status_code, 302)
        # The overlay section saved; the admin-only team formset never ran.
        self.assertTrue(
            DistrictrMapOverlays.objects.filter(overlay=self.overlay).exists()
        )
        self.assertFalse(TeamDistrictrMap.objects.exists())

    def test_delete_checkbox_removes_link(self):
        link = DistrictrMapOverlays.objects.create(
            districtr_map=self.districtr_map, overlay=self.overlay
        )
        response = self.client.post(
            self.url,
            self.form_data(
                **{
                    "overlay_links-TOTAL_FORMS": "2",
                    "overlay_links-INITIAL_FORMS": "1",
                    "overlay_links-0-id": str(link.pk),
                    "overlay_links-0-overlay": str(self.overlay.pk),
                    "overlay_links-0-DELETE": "on",
                }
            ),
        )
        self.assertEqual(response.status_code, 302)
        self.assertFalse(DistrictrMapOverlays.objects.exists())

    def test_duplicate_link_is_a_form_error_not_a_500(self):
        link = DistrictrMapOverlays.objects.create(
            districtr_map=self.districtr_map, overlay=self.overlay
        )
        response = self.client.post(
            self.url,
            self.form_data(
                **{
                    "overlay_links-TOTAL_FORMS": "2",
                    "overlay_links-INITIAL_FORMS": "1",
                    "overlay_links-0-id": str(link.pk),
                    "overlay_links-0-overlay": str(self.overlay.pk),
                    "overlay_links-1-overlay": str(self.overlay.pk),
                }
            ),
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "could not be saved")
        self.assertEqual(DistrictrMapOverlays.objects.count(), 1)

    def test_invalid_formset_choice_does_not_save_map_changes(self):
        response = self.client.post(
            self.url,
            self.form_data(
                name="Renamed",
                **{"overlay_links-0-overlay": "bogus-not-a-uuid"},
            ),
        )
        self.assertEqual(response.status_code, 200)
        self.districtr_map.refresh_from_db()
        self.assertEqual(self.districtr_map.name, "Colorado")
