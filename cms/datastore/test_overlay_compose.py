"""
Tests for the overlay upload and map module composition admin tools, plus
the admin-menu cross-links to the legacy frontend review pages.

The backend and object storage are never touched: requests/boto3 are mocked.
The datastore mirrors are managed=False so their tables do not exist in the
Django test database — setUp creates them inside the per-test transaction
(same pattern as ThumbnailViewTests in test_admin_tools.py; content/tests.py
and galleries/tests.py do the equivalent for their mirrors).
"""

from unittest import mock

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import RequestFactory, SimpleTestCase, TestCase, override_settings
from django.urls import reverse

from authapi.models import ReviewTagAssignment
from authapi.tests import fastapi_style_verify
from datastore import services, wagtail_hooks
from datastore.forms import MAX_OVERLAY_BYTES, ComposeMapForm, OverlayUploadForm
from datastore.models import (
    DistrictrMap,
    DistrictrMapOverlays,
    GerryDBTable,
    MapGroup,
    Overlay,
)
from datastore.services import BackendAPIError
from datastore.test_admin_tools import PASSWORD, make_admin_user


def create_mirror_tables(*models):
    """The managed=False mirrors need real tables inside the test transaction."""
    with connection.schema_editor() as editor:
        for model in models:
            editor.create_model(model)


# ---------------------------------------------------------------------------
# Services
# ---------------------------------------------------------------------------


@override_settings(
    AWS_ACCESS_KEY_ID="key",
    AWS_SECRET_ACCESS_KEY="secret",
    GPKG_BUCKET="test-bucket",
    OVERLAY_PUBLIC_URL_BASE="",
)
class UploadOverlayServiceTests(SimpleTestCase):
    @mock.patch("datastore.services.get_s3_client")
    def test_uploads_under_prefix_and_falls_back_to_s3_path(self, get_client):
        file_obj = mock.Mock()
        url = services.upload_overlay(file_obj, "20260611-cities.geojson")
        self.assertEqual(url, "s3://test-bucket/overlays/20260611-cities.geojson")
        get_client.return_value.upload_fileobj.assert_called_once_with(
            file_obj, "test-bucket", "overlays/20260611-cities.geojson"
        )

    @override_settings(OVERLAY_PUBLIC_URL_BASE="https://tilesets1.cdn.districtr.org/")
    @mock.patch("datastore.services.get_s3_client")
    def test_builds_public_url_from_cdn_base(self, get_client):
        url = services.upload_overlay(mock.Mock(), "cities.pmtiles")
        self.assertEqual(
            url, "https://tilesets1.cdn.districtr.org/overlays/cities.pmtiles"
        )

    @override_settings(GPKG_BUCKET="")
    def test_missing_bucket_raises(self):
        with self.assertRaises(ImproperlyConfigured):
            services.upload_overlay(mock.Mock(), "x.geojson")


def compose_kwargs(**overrides):
    kwargs = dict(
        name="Colorado blocks",
        districtr_map_slug="co-blocks-demo",
        parent_layer="co_blocks",
        child_layer=None,
        num_districts=8,
        tiles_s3_path=None,
        group_slug=None,
        map_type="default",
    )
    kwargs.update(overrides)
    return kwargs


@override_settings(BACKEND_API_URL="http://backend:8000")
class ScheduleComposeTests(SimpleTestCase):
    @mock.patch("datastore.services.requests.post")
    def test_posts_exact_contract_with_bearer_token(self, post):
        post.return_value = mock.Mock(
            status_code=202,
            json=mock.Mock(
                return_value={
                    "status": "scheduled",
                    "districtr_map_slug": "co-blocks-demo",
                }
            ),
        )
        result = services.schedule_compose(
            **compose_kwargs(
                child_layer="co_vtds",
                tiles_s3_path="tilesets/co.pmtiles",
                group_slug="states",
            )
        )

        self.assertEqual(
            result, {"status": "scheduled", "districtr_map_slug": "co-blocks-demo"}
        )
        post.assert_called_once()
        args, kwargs = post.call_args
        self.assertEqual(args[0], "http://backend:8000/api/admin/districtr-map/compose")
        self.assertEqual(
            kwargs["json"],
            {
                "name": "Colorado blocks",
                "districtr_map_slug": "co-blocks-demo",
                "parent_layer": "co_blocks",
                "child_layer": "co_vtds",
                "num_districts": 8,
                "tiles_s3_path": "tilesets/co.pmtiles",
                "group_slug": "states",
                "map_type": "default",
                "visible": False,
            },
        )
        authorization = kwargs["headers"]["Authorization"]
        self.assertTrue(authorization.startswith("Bearer "))
        payload = fastapi_style_verify(authorization.removeprefix("Bearer "))
        self.assertEqual(payload["sub"], "service:cms-admin")
        self.assertEqual(payload["scope"], "create:districtr_maps")

    @mock.patch("datastore.services.requests.post")
    def test_nullable_fields_serialize_as_null(self, post):
        post.return_value = mock.Mock(
            status_code=202, json=mock.Mock(return_value={"status": "scheduled"})
        )
        services.schedule_compose(**compose_kwargs())
        body = post.call_args.kwargs["json"]
        self.assertIsNone(body["child_layer"])
        self.assertIsNone(body["tiles_s3_path"])
        self.assertIsNone(body["group_slug"])
        self.assertIs(body["visible"], False)

    @mock.patch("datastore.services.requests.post")
    def test_non_202_surfaces_json_detail(self, post):
        post.return_value = mock.Mock(
            status_code=409,
            json=mock.Mock(
                return_value={"detail": "districtr_map_slug already exists"}
            ),
            text='{"detail": "districtr_map_slug already exists"}',
        )
        with self.assertRaises(BackendAPIError) as ctx:
            services.schedule_compose(**compose_kwargs())
        self.assertIn("409", str(ctx.exception))
        self.assertIn("districtr_map_slug already exists", str(ctx.exception))

    @mock.patch("datastore.services.requests.post")
    def test_non_202_falls_back_to_body_text_when_not_json(self, post):
        post.return_value = mock.Mock(
            status_code=502,
            json=mock.Mock(side_effect=ValueError("no json")),
            text="Bad Gateway",
        )
        with self.assertRaises(BackendAPIError) as ctx:
            services.schedule_compose(**compose_kwargs())
        self.assertIn("502", str(ctx.exception))
        self.assertIn("Bad Gateway", str(ctx.exception))


# ---------------------------------------------------------------------------
# Form validation
# ---------------------------------------------------------------------------


class OverlayUploadFormTests(TestCase):
    BASE = {"name": "Cities", "layer_type": "fill"}

    def setUp(self):
        # The districtr_maps multi-select queries the DistrictrMap mirror.
        create_mirror_tables(GerryDBTable, DistrictrMap)
        table = GerryDBTable.objects.create(name="co_blocks")
        self.map_a = DistrictrMap.objects.create(
            name="Colorado", districtr_map_slug="co_demo", parent_layer=table
        )
        self.map_b = DistrictrMap.objects.create(
            name="Texas", districtr_map_slug="tx_demo", parent_layer=table
        )

    def form(self, data=None, files=None):
        return OverlayUploadForm(data={**self.BASE, **(data or {})}, files=files)

    def test_valid_with_geojson_file(self):
        upload = SimpleUploadedFile("parks.geojson", b"{}")
        form = self.form(files={"overlay_file": upload})
        self.assertTrue(form.is_valid())
        self.assertEqual(form.cleaned_data["data_type"], "geojson")

    def test_valid_with_pmtiles_file_and_source_layer(self):
        upload = SimpleUploadedFile("cities.pmtiles", b"pm")
        form = self.form({"source_layer": "cities"}, files={"overlay_file": upload})
        self.assertTrue(form.is_valid())
        self.assertEqual(form.cleaned_data["data_type"], "pmtiles")

    def test_pmtiles_requires_source_layer(self):
        upload = SimpleUploadedFile("cities.pmtiles", b"pm")
        form = self.form(files={"overlay_file": upload})
        self.assertFalse(form.is_valid())
        self.assertIn("source_layer", form.errors)

    def test_pmtiles_path_requires_source_layer(self):
        form = self.form({"overlay_path": "s3://bucket/overlays/cities.pmtiles"})
        self.assertFalse(form.is_valid())
        self.assertIn("source_layer", form.errors)

    def test_geojson_rejects_source_layer(self):
        upload = SimpleUploadedFile("parks.geojson", b"{}")
        form = self.form({"source_layer": "parks"}, files={"overlay_file": upload})
        self.assertFalse(form.is_valid())
        self.assertIn("source_layer", form.errors)

    def test_requires_exactly_one_source(self):
        self.assertFalse(self.form().is_valid())
        both = self.form(
            {"overlay_path": "s3://bucket/overlays/parks.geojson"},
            files={"overlay_file": SimpleUploadedFile("parks.geojson", b"{}")},
        )
        self.assertFalse(both.is_valid())
        self.assertIn("not both", str(both.non_field_errors()))

    def test_rejects_wrong_extension(self):
        upload = SimpleUploadedFile("parks.zip", b"zip")
        form = self.form(files={"overlay_file": upload})
        self.assertFalse(form.is_valid())
        self.assertIn("overlay_file", form.errors)

    def test_rejects_oversized_file(self):
        upload = SimpleUploadedFile("parks.geojson", b"x")
        upload.size = MAX_OVERLAY_BYTES + 1
        form = self.form(files={"overlay_file": upload})
        self.assertFalse(form.is_valid())
        self.assertIn("1 GB", str(form.errors["overlay_file"]))

    def test_rejects_path_with_bad_suffix(self):
        form = self.form({"overlay_path": "https://example.com/parks.zip"})
        self.assertFalse(form.is_valid())
        self.assertIn("overlay_path", form.errors)

    def test_rejects_path_without_scheme(self):
        form = self.form({"overlay_path": "bucket/overlays/parks.geojson"})
        self.assertFalse(form.is_valid())
        self.assertIn("overlay_path", form.errors)

    def test_rejects_bad_custom_style_json(self):
        form = self.form(
            {
                "overlay_path": "https://example.com/parks.geojson",
                "custom_style": "{not json",
            }
        )
        self.assertFalse(form.is_valid())
        self.assertIn("Invalid JSON", str(form.errors["custom_style"]))

    def test_parses_custom_style_json(self):
        form = self.form(
            {
                "overlay_path": "https://example.com/parks.geojson",
                "custom_style": '{"fill-opacity": 0.5}',
            }
        )
        self.assertTrue(form.is_valid())
        self.assertEqual(form.cleaned_data["custom_style"], {"fill-opacity": 0.5})

    def test_empty_custom_style_cleans_to_none(self):
        form = self.form({"overlay_path": "https://example.com/parks.geojson"})
        self.assertTrue(form.is_valid())
        self.assertIsNone(form.cleaned_data["custom_style"])

    def test_map_choices_come_from_mirror(self):
        form = self.form(
            {
                "overlay_path": "https://example.com/parks.geojson",
                "districtr_maps": [str(self.map_a.pk), str(self.map_b.pk)],
            }
        )
        self.assertTrue(form.is_valid())
        self.assertCountEqual(
            form.cleaned_data["districtr_maps"], [self.map_a, self.map_b]
        )


class ComposeMapFormTests(TestCase):
    def setUp(self):
        create_mirror_tables(GerryDBTable, MapGroup)
        self.parent = GerryDBTable.objects.create(name="co_blocks")
        self.child = GerryDBTable.objects.create(name="co_vtds")
        self.group = MapGroup.objects.create(slug="states", name="States")

    def form(self, data=None):
        base = {
            "name": "Colorado blocks",
            "districtr_map_slug": "co-blocks-demo",
            "parent_layer": str(self.parent.pk),
            "num_districts": "8",
            "map_type": "default",
        }
        return ComposeMapForm(data={**base, **(data or {})})

    def test_layer_choices_come_from_gerrydb_rows(self):
        form = ComposeMapForm()
        self.assertCountEqual(
            form.fields["parent_layer"].queryset, [self.parent, self.child]
        )
        self.assertCountEqual(
            form.fields["child_layer"].queryset, [self.parent, self.child]
        )
        self.assertCountEqual(form.fields["map_group"].queryset, [self.group])

    def test_valid_minimal(self):
        self.assertTrue(self.form().is_valid())

    def test_child_must_differ_from_parent(self):
        form = self.form({"child_layer": str(self.parent.pk)})
        self.assertFalse(form.is_valid())
        self.assertIn("child_layer", form.errors)

    def test_slug_regex_enforced(self):
        for bad_slug in ("Bad Slug!", "co_blocks", "CO-blocks"):
            form = self.form({"districtr_map_slug": bad_slug})
            self.assertFalse(form.is_valid(), bad_slug)
            self.assertIn("districtr_map_slug", form.errors)
        self.assertTrue(self.form({"districtr_map_slug": "co-blocks-2"}).is_valid())

    def test_num_districts_bounds(self):
        self.assertFalse(self.form({"num_districts": "0"}).is_valid())
        self.assertFalse(self.form({"num_districts": "201"}).is_valid())
        self.assertTrue(self.form({"num_districts": "200"}).is_valid())


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------


class UploadOverlayViewTests(TestCase):
    def setUp(self):
        create_mirror_tables(GerryDBTable, DistrictrMap, Overlay, DistrictrMapOverlays)
        table = GerryDBTable.objects.create(name="co_blocks")
        self.map_a = DistrictrMap.objects.create(
            name="Colorado", districtr_map_slug="co_demo", parent_layer=table
        )
        self.map_b = DistrictrMap.objects.create(
            name="Texas", districtr_map_slug="tx_demo", parent_layer=table
        )
        make_admin_user()
        self.client.login(username="dataops@districtr.org", password=PASSWORD)
        self.url = reverse("datastore_upload_overlay")

    def test_anonymous_is_redirected_to_login(self):
        self.client.logout()
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 302)
        self.assertIn(reverse("wagtailadmin_login"), response.url)

    def test_partner_without_overlay_permission_is_denied(self):
        make_admin_user(email="partner@districtr.org", group_name="partner")
        self.client.login(username="partner@districtr.org", password=PASSWORD)
        response = self.client.get(self.url)
        self.assertRedirects(response, reverse("wagtailadmin_home"))

    def test_admin_group_user_gets_form(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Upload overlay")
        self.assertContains(response, "Create overlay")
        # Map multi-select lists the mirror rows.
        self.assertContains(response, "Colorado")
        self.assertContains(response, "Texas")

    def test_upload_creates_overlay_and_junction_rows(self):
        with mock.patch(
            "datastore.services.upload_overlay",
            return_value="https://cdn.example/overlays/city_labels.pmtiles",
        ) as upload:
            response = self.client.post(
                self.url,
                {
                    "overlay_file": SimpleUploadedFile("city labels.pmtiles", b"pm"),
                    "name": "City labels",
                    "description": "Place names",
                    "layer_type": "text",
                    "source_layer": "cities",
                    "id_property": "NAME",
                    "custom_style": '{"text-size": 12}',
                    "districtr_maps": [str(self.map_a.pk), str(self.map_b.pk)],
                },
                follow=True,
            )

        upload_file, upload_key = upload.call_args.args
        self.assertEqual(upload_file.name, "city labels.pmtiles")
        self.assertTrue(upload_key.endswith("city_labels.pmtiles"))  # sanitized

        overlay = Overlay.objects.get()
        self.assertEqual(overlay.name, "City labels")
        self.assertEqual(overlay.data_type, "pmtiles")  # inferred from extension
        self.assertEqual(overlay.layer_type, "text")
        self.assertEqual(
            overlay.source, "https://cdn.example/overlays/city_labels.pmtiles"
        )
        self.assertEqual(overlay.source_layer, "cities")
        self.assertEqual(overlay.id_property, "NAME")
        self.assertEqual(overlay.custom_style, {"text-size": 12})

        links = DistrictrMapOverlays.objects.filter(overlay=overlay)
        self.assertCountEqual(
            [link.districtr_map_id for link in links],
            [self.map_a.pk, self.map_b.pk],
        )
        self.assertContains(response, "City labels")
        self.assertContains(response, "attached to 2 map(s)")

    @override_settings(
        AWS_ACCESS_KEY_ID="key",
        AWS_SECRET_ACCESS_KEY="secret",
        GPKG_BUCKET="test-bucket",
        OVERLAY_PUBLIC_URL_BASE="https://tilesets1.cdn.districtr.org",
    )
    def test_source_url_built_from_overlay_public_url_base(self):
        with mock.patch("datastore.services.get_s3_client"):
            self.client.post(
                self.url,
                {
                    "overlay_file": SimpleUploadedFile("parks.geojson", b"{}"),
                    "name": "Parks",
                    "layer_type": "fill",
                },
                follow=True,
            )
        overlay = Overlay.objects.get()
        self.assertTrue(
            overlay.source.startswith("https://tilesets1.cdn.districtr.org/overlays/")
        )
        self.assertTrue(overlay.source.endswith("parks.geojson"))

    def test_existing_path_skips_upload_and_infers_geojson(self):
        with mock.patch("datastore.services.upload_overlay") as upload:
            response = self.client.post(
                self.url,
                {
                    "overlay_path": "https://example.com/data/parks.geojson",
                    "name": "Parks",
                    "layer_type": "fill",
                },
                follow=True,
            )
        upload.assert_not_called()
        overlay = Overlay.objects.get()
        self.assertEqual(overlay.source, "https://example.com/data/parks.geojson")
        self.assertEqual(overlay.data_type, "geojson")
        self.assertIsNone(overlay.description)
        self.assertEqual(DistrictrMapOverlays.objects.count(), 0)
        self.assertContains(response, "attached to 0 map(s)")

    def test_invalid_form_creates_nothing(self):
        with mock.patch("datastore.services.upload_overlay") as upload:
            response = self.client.post(
                self.url, {"name": "Parks", "layer_type": "fill"}
            )
        upload.assert_not_called()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Overlay.objects.count(), 0)
        self.assertContains(response, "Provide an overlay file")

    def test_upload_error_is_surfaced_and_nothing_created(self):
        with mock.patch(
            "datastore.services.upload_overlay",
            side_effect=ImproperlyConfigured("No upload bucket configured"),
        ):
            response = self.client.post(
                self.url,
                {
                    "overlay_file": SimpleUploadedFile("parks.geojson", b"{}"),
                    "name": "Parks",
                    "layer_type": "fill",
                },
                follow=True,
            )
        self.assertContains(response, "Overlay upload failed")
        self.assertEqual(Overlay.objects.count(), 0)


class ComposeMapViewTests(TestCase):
    def setUp(self):
        create_mirror_tables(GerryDBTable, MapGroup)
        self.parent = GerryDBTable.objects.create(name="co_blocks")
        self.child = GerryDBTable.objects.create(name="co_vtds")
        self.group = MapGroup.objects.create(slug="states", name="States")
        make_admin_user()
        self.client.login(username="dataops@districtr.org", password=PASSWORD)
        self.url = reverse("datastore_compose_map")

    def test_anonymous_is_redirected_to_login(self):
        self.client.logout()
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 302)
        self.assertIn(reverse("wagtailadmin_login"), response.url)

    def test_partner_without_datastore_permission_is_denied(self):
        make_admin_user(email="partner@districtr.org", group_name="partner")
        self.client.login(username="partner@districtr.org", password=PASSWORD)
        response = self.client.get(self.url)
        self.assertRedirects(response, reverse("wagtailadmin_home"))

    def test_admin_group_user_gets_form_with_layer_choices(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Compose map module")
        self.assertContains(response, "Schedule composition")
        self.assertContains(response, "co_blocks")
        self.assertContains(response, "co_vtds")

    def test_submit_calls_schedule_compose_with_contract(self):
        with mock.patch(
            "datastore.services.schedule_compose",
            return_value={
                "status": "scheduled",
                "districtr_map_slug": "co-blocks-demo",
            },
        ) as schedule:
            response = self.client.post(
                self.url,
                {
                    "name": "Colorado blocks",
                    "districtr_map_slug": "co-blocks-demo",
                    "parent_layer": str(self.parent.pk),
                    "child_layer": str(self.child.pk),
                    "num_districts": "8",
                    "tiles_s3_path": "tilesets/co.pmtiles",
                    "map_group": "states",
                    "map_type": "default",
                },
                follow=True,
            )
        schedule.assert_called_once_with(
            name="Colorado blocks",
            districtr_map_slug="co-blocks-demo",
            parent_layer="co_blocks",
            child_layer="co_vtds",
            num_districts=8,
            tiles_s3_path="tilesets/co.pmtiles",
            group_slug="states",
            map_type="default",
        )
        self.assertContains(response, "Module composition scheduled")
        self.assertContains(response, "created hidden")

    def test_optional_fields_default_to_none(self):
        with mock.patch(
            "datastore.services.schedule_compose",
            return_value={"status": "scheduled", "districtr_map_slug": "co-min"},
        ) as schedule:
            self.client.post(
                self.url,
                {
                    "name": "Colorado minimal",
                    "districtr_map_slug": "co-min",
                    "parent_layer": str(self.parent.pk),
                    "num_districts": "5",
                    "map_type": "local",
                },
                follow=True,
            )
        schedule.assert_called_once_with(
            name="Colorado minimal",
            districtr_map_slug="co-min",
            parent_layer="co_blocks",
            child_layer=None,
            num_districts=5,
            tiles_s3_path=None,
            group_slug=None,
            map_type="local",
        )

    def test_backend_error_is_surfaced(self):
        with mock.patch(
            "datastore.services.schedule_compose",
            side_effect=BackendAPIError(
                "Backend rejected the compose request (HTTP 409): "
                "districtr_map_slug already exists"
            ),
        ):
            response = self.client.post(
                self.url,
                {
                    "name": "Colorado blocks",
                    "districtr_map_slug": "co-blocks-demo",
                    "parent_layer": str(self.parent.pk),
                    "num_districts": "8",
                    "map_type": "default",
                },
                follow=True,
            )
        self.assertContains(response, "Composition failed")
        self.assertContains(response, "HTTP 409")

    def test_invalid_form_does_not_call_service(self):
        with mock.patch("datastore.services.schedule_compose") as schedule:
            response = self.client.post(
                self.url,
                {
                    "name": "Colorado blocks",
                    "districtr_map_slug": "co-blocks-demo",
                    "parent_layer": str(self.parent.pk),
                    "child_layer": str(self.parent.pk),
                    "num_districts": "8",
                    "map_type": "default",
                },
            )
        schedule.assert_not_called()
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "must differ from the parent layer")


# ---------------------------------------------------------------------------
# Review-site menu items
# ---------------------------------------------------------------------------


class ReviewSiteMenuItemTests(TestCase):
    def request_for(self, user):
        request = RequestFactory().get("/admin/")
        request.user = user
        return request

    def items(self):
        return [
            wagtail_hooks.register_comment_review_menu_item(),
            wagtail_hooks.register_district_comments_menu_item(),
            wagtail_hooks.register_site_thumbnails_menu_item(),
        ]

    def test_urls_built_from_frontend_url(self):
        items = self.items()
        self.assertEqual(
            [(item.label, item.url) for item in items],
            [
                ("Comment review", f"{settings.FRONTEND_URL}/admin/review"),
                (
                    "District comments",
                    f"{settings.FRONTEND_URL}/admin/review/district-comments",
                ),
                ("Thumbnails (site)", f"{settings.FRONTEND_URL}/admin/thumbnails"),
            ],
        )

    def test_ordered_after_galleries(self):
        # Galleries sits at 210; the cross-links follow it.
        self.assertEqual([item.order for item in self.items()], [220, 230, 240])

    def test_visibility_matches_group_scopes(self):
        # Per-link gates mirror the FastAPI scopes each page needs:
        # Comment review / District comments need create:content_review
        # (admin + reviewer), Thumbnails needs create:content (admin +
        # editor). A link that can only 403 must not be shown.
        expected = {
            "admin": {"Comment review", "District comments", "Thumbnails (site)"},
            "reviewer": {"Comment review", "District comments"},
            "editor": {"Thumbnails (site)"},
        }
        for group, visible_labels in expected.items():
            user = make_admin_user(email=f"{group}@districtr.org", group_name=group)
            request = self.request_for(user)
            shown = {item.label for item in self.items() if item.is_shown(request)}
            self.assertEqual(shown, visible_labels, f"wrong menu links for {group}")

    def test_tag_scoped_reviewer_loses_district_comments_only(self):
        # ReviewTagAssignment strips read:read-all from the reviewer's token
        # (authapi/scopes.py), so the district-comments page always 403s for
        # them — the link must disappear while Comment review stays.
        user = make_admin_user(email="scoped@districtr.org", group_name="reviewer")
        ReviewTagAssignment.objects.create(user=user, tag_slug="schools")
        request = self.request_for(user)
        shown = {item.label for item in self.items() if item.is_shown(request)}
        self.assertEqual(shown, {"Comment review"})

    def test_admin_with_assignments_keeps_district_comments(self):
        # Admin-group members keep read:read-all despite assignments
        # (scopes_for_user), so the link stays.
        user = make_admin_user(email="adminscoped@districtr.org", group_name="admin")
        ReviewTagAssignment.objects.create(user=user, tag_slug="schools")
        request = self.request_for(user)
        shown = {item.label for item in self.items() if item.is_shown(request)}
        self.assertEqual(
            shown, {"Comment review", "District comments", "Thumbnails (site)"}
        )

    def test_shown_for_superuser_without_groups(self):
        user = get_user_model().objects.create_superuser(
            username="root@districtr.org",
            email="root@districtr.org",
            password=PASSWORD,
        )
        for item in self.items():
            self.assertTrue(item.is_shown(self.request_for(user)))

    def test_hidden_for_partner(self):
        user = make_admin_user(email="partner@districtr.org", group_name="partner")
        for item in self.items():
            self.assertFalse(
                item.is_shown(self.request_for(user)),
                f"{item.label} shown for partner",
            )
