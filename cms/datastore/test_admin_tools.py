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
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.core.exceptions import ImproperlyConfigured
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse

from authapi.tests import fastapi_style_verify
from datastore import services
from datastore.forms import MAX_GPKG_BYTES, GeoPackageImportForm
from datastore.models import DistrictrMap, GerryDBTable
from datastore.services import BackendAPIError

PASSWORD = "correct-horse-battery-staple"


def make_admin_user(email="dataops@districtr.org", group_name="admin"):
    """A user who can enter the Wagtail admin, in the given group."""
    user = get_user_model().objects.create_user(
        username=email, email=email, password=PASSWORD
    )
    user.groups.add(Group.objects.get(name=group_name))
    user.user_permissions.add(
        Permission.objects.get(
            content_type__app_label="wagtailadmin", codename="access_admin"
        )
    )
    return user


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
    R2_ACCOUNT_ID="",
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

    @override_settings(R2_ACCOUNT_ID="acct123")
    @mock.patch("datastore.services.boto3.client")
    def test_r2_endpoint_from_account_id(self, boto3_client):
        services.get_s3_client()
        kwargs = boto3_client.call_args.kwargs
        self.assertEqual(
            kwargs["endpoint_url"], "https://acct123.r2.cloudflarestorage.com"
        )
        self.assertEqual(kwargs["region_name"], "auto")

    @override_settings(AWS_S3_ENDPOINT="https://minio.local:9000")
    @mock.patch("datastore.services.boto3.client")
    def test_custom_endpoint_when_no_account_id(self, boto3_client):
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


class GeoPackageImportFormTests(SimpleTestCase):
    BASE = {"layer": "co_blocks"}

    def form(self, data=None, files=None):
        return GeoPackageImportForm(data={**self.BASE, **(data or {})}, files=files)

    def test_valid_with_file(self):
        upload = SimpleUploadedFile("co.gpkg", b"not-really-a-gpkg")
        self.assertTrue(self.form(files={"gpkg_file": upload}).is_valid())

    def test_valid_with_s3_path(self):
        self.assertTrue(self.form({"gpkg_path": "s3://bucket/co.gpkg"}).is_valid())

    def test_rejects_wrong_extension(self):
        upload = SimpleUploadedFile("co.zip", b"zip")
        form = self.form(files={"gpkg_file": upload})
        self.assertFalse(form.is_valid())
        self.assertIn("gpkg_file", form.errors)

    def test_rejects_oversized_file(self):
        upload = SimpleUploadedFile("co.gpkg", b"x")
        upload.size = MAX_GPKG_BYTES + 1
        form = self.form(files={"gpkg_file": upload})
        self.assertFalse(form.is_valid())
        self.assertIn("2 GB", str(form.errors["gpkg_file"]))

    def test_rejects_non_s3_path(self):
        form = self.form({"gpkg_path": "https://example.com/co.gpkg"})
        self.assertFalse(form.is_valid())
        self.assertIn("gpkg_path", form.errors)

    def test_rejects_path_without_gpkg_extension(self):
        form = self.form({"gpkg_path": "s3://bucket/co.zip"})
        self.assertFalse(form.is_valid())

    def test_requires_exactly_one_source(self):
        self.assertFalse(self.form().is_valid())
        both = self.form(
            {"gpkg_path": "s3://bucket/co.gpkg"},
            files={"gpkg_file": SimpleUploadedFile("co.gpkg", b"x")},
        )
        self.assertFalse(both.is_valid())
        self.assertIn("not both", str(both.non_field_errors()))

    def test_rejects_bad_layer_name(self):
        form = self.form(
            {"layer": "co-blocks; drop table", "gpkg_path": "s3://b/co.gpkg"}
        )
        self.assertFalse(form.is_valid())
        self.assertIn("layer", form.errors)


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------


class ImportViewPermissionTests(TestCase):
    def setUp(self):
        self.url = reverse("datastore_import_gpkg")

    def test_anonymous_is_redirected_to_login(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 302)
        self.assertIn(reverse("wagtailadmin_login"), response.url)

    def test_partner_without_datastore_permission_is_denied(self):
        make_admin_user(email="partner@districtr.org", group_name="partner")
        self.client.login(username="partner@districtr.org", password=PASSWORD)
        response = self.client.get(self.url)
        self.assertRedirects(response, reverse("wagtailadmin_home"))

    def test_admin_group_user_gets_form(self):
        make_admin_user()
        self.client.login(username="dataops@districtr.org", password=PASSWORD)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Import GeoPackage")
        self.assertContains(response, "Schedule import")


class ImportViewPostTests(TestCase):
    def setUp(self):
        make_admin_user()
        self.client.login(username="dataops@districtr.org", password=PASSWORD)
        self.url = reverse("datastore_import_gpkg")

    def test_upload_then_schedule_in_order(self):
        manager = mock.Mock()
        with (
            mock.patch(
                "datastore.services.upload_gpkg",
                return_value="s3://test-bucket/gerrydb-uploads/co.gpkg",
            ) as upload,
            mock.patch(
                "datastore.services.schedule_import",
                return_value={"status": "scheduled", "layer": "co_blocks"},
            ) as schedule,
        ):
            manager.attach_mock(upload, "upload")
            manager.attach_mock(schedule, "schedule")
            response = self.client.post(
                self.url,
                {
                    "gpkg_file": SimpleUploadedFile("co blocks.gpkg", b"gpkg-bytes"),
                    "layer": "co_blocks",
                    "rm": "on",
                },
                follow=True,
            )

        call_names = [name for name, *_ in manager.mock_calls]
        self.assertEqual(call_names, ["upload", "schedule"])

        upload_file, upload_key = upload.call_args.args
        self.assertEqual(upload_file.name, "co blocks.gpkg")
        self.assertTrue(upload_key.endswith("co_blocks.gpkg"))  # sanitized

        schedule.assert_called_once_with(
            gpkg_path="s3://test-bucket/gerrydb-uploads/co.gpkg",
            layer="co_blocks",
            table_name=None,
            rm=True,
        )
        self.assertContains(response, "Import scheduled for layer")

    def test_existing_s3_path_skips_upload(self):
        with (
            mock.patch("datastore.services.upload_gpkg") as upload,
            mock.patch(
                "datastore.services.schedule_import",
                return_value={"status": "scheduled", "layer": "tx_vtds"},
            ) as schedule,
        ):
            response = self.client.post(
                self.url,
                {
                    "gpkg_path": "s3://test-bucket/gerrydb-uploads/tx.gpkg",
                    "layer": "tx_vtds",
                    "table_name": "tx_vtds_v2",
                },
                follow=True,
            )

        upload.assert_not_called()
        schedule.assert_called_once_with(
            gpkg_path="s3://test-bucket/gerrydb-uploads/tx.gpkg",
            layer="tx_vtds",
            table_name="tx_vtds_v2",
            rm=False,
        )
        self.assertContains(response, "Import scheduled for layer")

    def test_backend_error_is_surfaced(self):
        with mock.patch(
            "datastore.services.schedule_import",
            side_effect=BackendAPIError("Backend rejected the import (HTTP 401)"),
        ):
            response = self.client.post(
                self.url,
                {"gpkg_path": "s3://b/co.gpkg", "layer": "co_blocks"},
                follow=True,
            )
        self.assertContains(response, "Import failed")
        self.assertContains(response, "HTTP 401")

    def test_invalid_form_does_not_call_services(self):
        with (
            mock.patch("datastore.services.upload_gpkg") as upload,
            mock.patch("datastore.services.schedule_import") as schedule,
        ):
            response = self.client.post(self.url, {"layer": "co_blocks"})
        upload.assert_not_called()
        schedule.assert_not_called()
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Provide a GeoPackage file")


class ThumbnailViewTests(TestCase):
    def setUp(self):
        # The mirrored public tables do not exist in the test database;
        # create them inside the per-test transaction (rolled back after).
        with connection.schema_editor() as editor:
            editor.create_model(GerryDBTable)
            editor.create_model(DistrictrMap)
        table = GerryDBTable.objects.create(name="co_blocks")
        self.districtr_map = DistrictrMap.objects.create(
            name="Colorado",
            districtr_map_slug="co_demo",
            parent_layer=table,
        )
        make_admin_user()
        self.client.login(username="dataops@districtr.org", password=PASSWORD)
        self.url = reverse("datastore_thumbnails")

    def test_anonymous_is_redirected_to_login(self):
        self.client.logout()
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 302)
        self.assertIn(reverse("wagtailadmin_login"), response.url)

    def test_page_lists_maps_in_dropdown(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Colorado")
        self.assertContains(response, "Regenerate map thumbnail")

    def test_map_thumbnail_posts_slug_to_service(self):
        with mock.patch(
            "datastore.services.regenerate_map_thumbnail",
            return_value={"message": "ok"},
        ) as regenerate:
            response = self.client.post(
                self.url,
                {"map-districtr_map": str(self.districtr_map.pk), "map_submit": "1"},
                follow=True,
            )
        regenerate.assert_called_once_with("co_demo")
        self.assertContains(response, "Thumbnail regeneration scheduled")

    def test_document_thumbnail_posts_id_to_service(self):
        with mock.patch(
            "datastore.services.regenerate_document_thumbnail",
            return_value={"message": "ok"},
        ) as regenerate:
            response = self.client.post(
                self.url,
                {"document-document_id": " abc123 ", "document_submit": "1"},
                follow=True,
            )
        regenerate.assert_called_once_with("abc123")
        self.assertContains(response, "Thumbnail regeneration scheduled")

    def test_backend_error_is_surfaced(self):
        with mock.patch(
            "datastore.services.regenerate_map_thumbnail",
            side_effect=BackendAPIError("Backend rejected the thumbnail request"),
        ):
            response = self.client.post(
                self.url,
                {"map-districtr_map": str(self.districtr_map.pk), "map_submit": "1"},
                follow=True,
            )
        self.assertContains(response, "Thumbnail regeneration failed")
