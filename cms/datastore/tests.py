"""
Meta-level tests for the managed=False mirrors of the Alembic-owned tables.

These deliberately avoid touching the mirrored `public` tables (which do not
exist in the Django test database): they assert on model _meta and on the
pure drift-comparison function with fake schema snapshots. The live-schema
check runs separately via `manage.py check_mirror_drift` (locally and in CI,
after the backend's Alembic migrations).
"""

from django.db import models
from django.test import SimpleTestCase, TestCase

from datastore.drift import (
    EXCLUDED_COLUMNS,
    compare_columns,
    mirrored_models,
    model_column_spec,
    parse_db_table,
)
from datastore.models import (
    DistrictrMap,
    DistrictrMapOverlays,
    DistrictrMapsToGroups,
    GeoUnitType,
    FormConfig,
    GerryDBTable,
    MapGroup,
    MapType,
    Overlay,
    OverlayDataType,
    OverlayLayerType,
)

# Source of truth: backend/app/models.py (Alembic owns the DDL).
EXPECTED_TABLES = {
    DistrictrMap: "districtrmap",
    GerryDBTable: "gerrydbtable",
    MapGroup: "map_group",
    DistrictrMapsToGroups: "districtrmaps_to_groups",
    DistrictrMapOverlays: "districtrmap_overlays",
    Overlay: "overlay",
    FormConfig: 'comments"."form_configs',
}

EXPECTED_COLUMNS = {
    DistrictrMap: {
        "uuid",
        "name",
        "districtr_map_slug",
        "gerrydb_table_name",
        "num_districts",
        "num_districts_modifiable",
        "tiles_s3_path",
        "parent_layer",
        "child_layer",
        "extent",
        "visible",
        "map_type",
        "comment",
        "parent_geo_unit_type",
        "child_geo_unit_type",
        "data_source_name",
        "statefps",
        "comment_length_limit",
        "comment_count_limit",
        "created_at",
        "updated_at",
    },
    GerryDBTable: {"uuid", "name", "created_at", "updated_at"},
    MapGroup: {"slug", "name"},
    DistrictrMapsToGroups: {"id", "districtrmap_uuid", "group_slug"},
    DistrictrMapOverlays: {"id", "districtr_map_id", "overlay_id"},
    Overlay: {
        "overlay_id",
        "name",
        "description",
        "data_type",
        "layer_type",
        "custom_style",
        "source",
        "source_layer",
        "id_property",
        "created_at",
        "updated_at",
    },
    FormConfig: {
        "id",
        "portal_id",
        "name",
        "fields",
        "required_fields",
        "require_email_confirm",
        "admin_teams",
        "collection_mode",
        "created_at",
        "updated_at",
    },
}


class MirrorMetaTests(SimpleTestCase):
    def test_all_mirrors_are_unmanaged(self):
        for model in EXPECTED_TABLES:
            with self.subTest(model=model.__name__):
                self.assertFalse(model._meta.managed)

    def test_db_table_names(self):
        for model, table in EXPECTED_TABLES.items():
            with self.subTest(model=model.__name__):
                self.assertEqual(model._meta.db_table, table)

    def test_mirrored_models_registry_matches_expected(self):
        self.assertEqual(set(mirrored_models()), set(EXPECTED_TABLES))

    def test_expected_column_sets(self):
        for model, columns in EXPECTED_COLUMNS.items():
            with self.subTest(model=model.__name__):
                self.assertEqual(set(model_column_spec(model)), columns)

    def test_every_excluded_columns_table_is_mirrored(self):
        self.assertEqual(set(EXCLUDED_COLUMNS), set(EXPECTED_TABLES.values()))

    def test_parse_db_table(self):
        self.assertEqual(parse_db_table("districtrmap"), ("public", "districtrmap"))
        self.assertEqual(
            parse_db_table('comments"."form_configs'),
            ("comments", "form_configs"),
        )

    def test_foreign_keys_do_nothing_and_unconstrained(self):
        for model in EXPECTED_TABLES:
            for field in model._meta.local_concrete_fields:
                if not isinstance(field, models.ForeignKey):
                    continue
                with self.subTest(model=model.__name__, field=field.name):
                    self.assertIs(field.remote_field.on_delete, models.DO_NOTHING)
                    self.assertFalse(field.db_constraint)

    def test_layer_fks_target_gerrydb_name(self):
        for field_name in ("parent_layer", "child_layer"):
            field = DistrictrMap._meta.get_field(field_name)
            self.assertIs(field.remote_field.model, GerryDBTable)
            self.assertEqual(field.target_field.name, "name")

    def test_enum_choices_match_backend(self):
        # Postgres enum `maptype` + backend GeoUnitType / overlay enums
        # (backend/app/models.py).
        self.assertEqual(MapType.values, ["default", "local", "community"])
        self.assertEqual(GeoUnitType.values, ["vtd", "bg", "block"])
        self.assertEqual(OverlayDataType.values, ["geojson", "pmtiles"])
        self.assertEqual(OverlayLayerType.values, ["fill", "line", "text"])

        self.assertEqual(
            DistrictrMap._meta.get_field("map_type").choices, MapType.choices
        )
        for field_name in ("parent_geo_unit_type", "child_geo_unit_type"):
            self.assertEqual(
                DistrictrMap._meta.get_field(field_name).choices,
                GeoUnitType.choices,
            )
        self.assertEqual(
            Overlay._meta.get_field("data_type").choices, OverlayDataType.choices
        )
        self.assertEqual(
            Overlay._meta.get_field("layer_type").choices, OverlayLayerType.choices
        )

    def test_junction_surrogate_pks_and_unique_pairs(self):
        for model, pair in (
            (DistrictrMapsToGroups, ["districtrmap", "group"]),
            (DistrictrMapOverlays, ["districtr_map", "overlay"]),
        ):
            with self.subTest(model=model.__name__):
                self.assertIsInstance(model._meta.pk, models.AutoField)
                unique_field_sets = [
                    list(constraint.fields)
                    for constraint in model._meta.constraints
                    if isinstance(constraint, models.UniqueConstraint)
                ]
                self.assertIn(pair, unique_field_sets)


class CompareColumnsTests(SimpleTestCase):
    """The drift check's comparison logic, on fake schema snapshots."""

    MODEL_SPEC = {"uuid": False, "name": False, "comment": True}

    def test_in_sync_returns_no_problems(self):
        self.assertEqual(
            compare_columns("t", self.MODEL_SPEC, dict(self.MODEL_SPEC)), []
        )

    def test_column_missing_from_model(self):
        db_spec = {**self.MODEL_SPEC, "brand_new": True}
        problems = compare_columns("t", self.MODEL_SPEC, db_spec)
        self.assertEqual(len(problems), 1)
        self.assertIn("t.brand_new", problems[0])
        self.assertIn("not mapped on the model", problems[0])

    def test_column_missing_from_database(self):
        db_spec = {"uuid": False, "name": False}
        problems = compare_columns("t", self.MODEL_SPEC, db_spec)
        self.assertEqual(len(problems), 1)
        self.assertIn("t.comment", problems[0])
        self.assertIn("missing from the database", problems[0])

    def test_nullability_mismatch(self):
        db_spec = {**self.MODEL_SPEC, "name": True}
        problems = compare_columns("t", self.MODEL_SPEC, db_spec)
        self.assertEqual(len(problems), 1)
        self.assertIn("t.name", problems[0])
        self.assertIn("nullability mismatch", problems[0])

    def test_excluded_columns_are_ignored(self):
        db_spec = {**self.MODEL_SPEC, "geometry": True}
        problems = compare_columns(
            "t", self.MODEL_SPEC, db_spec, excluded=frozenset({"geometry"})
        )
        self.assertEqual(problems, [])

    def test_multiple_problems_are_all_reported(self):
        db_spec = {"uuid": True, "name": False, "added": False}
        problems = compare_columns("t", self.MODEL_SPEC, db_spec)
        self.assertEqual(len(problems), 3)


class FormConfigScopingTests(TestCase):
    """Team scoping on the portal-form snippet — the ACL the backend's
    require_portal_admin reads. Bypass-by-URL and fail-open-for-team-less
    are the repo's historical bug class."""

    def setUp(self):
        from core.testing import (
            create_mirror_tables,
            make_form_config,
            make_team,
            make_user,
        )
        from datastore.models import FormConfig

        create_mirror_tables(FormConfig)
        self.partner = make_user("partner", "p@d.org", access_admin=True)
        self.team = make_team("Mine Team", members=[self.partner])
        make_team("Other Team")
        self.mine = make_form_config("my-portal", admin_teams=["mine-team"])
        self.theirs = make_form_config("their-portal", admin_teams=["other-team"])

    def _policy(self):
        from datastore.wagtail_hooks import FormConfigPermissionPolicy
        from datastore.models import FormConfig

        return FormConfigPermissionPolicy(FormConfig)

    def test_scoped_partner_sees_only_own_configs(self):
        instances = self._policy().instances_user_has_permission_for(
            self.partner, "change"
        )
        self.assertEqual([c.portal_id for c in instances], ["my-portal"])
        self.assertFalse(
            self._policy().user_has_permission_for_instance(
                self.partner, "change", self.theirs
            )
        )

    def test_team_less_partner_fails_closed(self):
        from core.testing import make_user

        loner = make_user("partner", "loner@d.org", access_admin=True)
        instances = self._policy().instances_user_has_permission_for(loner, "change")
        self.assertEqual(list(instances), [])

    def test_out_of_scope_edit_by_url_denied(self):
        self.client.force_login(self.partner)
        response = self.client.get(
            f"/admin/snippets/datastore/formconfig/edit/{self.theirs.pk}/"
        )
        self.assertEqual(response.status_code, 404)
        ok = self.client.get(
            f"/admin/snippets/datastore/formconfig/edit/{self.mine.pk}/"
        )
        self.assertEqual(ok.status_code, 200)

    def test_out_of_scope_history_by_url_404s(self):
        self.client.force_login(self.partner)
        response = self.client.get(
            f"/admin/snippets/datastore/formconfig/history/{self.theirs.pk}/"
        )
        self.assertEqual(response.status_code, 404)


class FormConfigAdminFormTests(TestCase):
    """The form's own scoping: restricted editors only grant/revoke their
    own teams, must keep one, and cannot re-point portal_id."""

    def setUp(self):
        from core.testing import (
            create_mirror_tables,
            make_form_config,
            make_portal,
            make_team,
            make_user,
        )
        from datastore.models import DistrictrMap, FormConfig, GerryDBTable

        create_mirror_tables(GerryDBTable, DistrictrMap, FormConfig)
        # TagPage.full_clean validates districtr_map_slug once the mirror
        # exists, so the referenced map row must too.
        layer = GerryDBTable.objects.create(name="blocks")
        DistrictrMap.objects.create(
            name="Chi", districtr_map_slug="chi_wards", parent_layer=layer
        )
        self.partner = make_user("partner", "p@d.org", access_admin=True)
        self.admin = make_user("admin", "a@d.org", access_admin=True)
        self.team = make_team("Mine Team", members=[self.partner])
        make_team("Other Team")
        self.portal = make_portal("my-portal")
        self.config = make_form_config("my-portal", admin_teams=["mine-team"])

    def _form(self, user, **overrides):
        from datastore.wagtail_hooks import FormConfigAdminForm

        data = {
            "portal_id": "my-portal",
            "name": "My Portal",
            "fields": ["title", "comment"],
            "required_fields": ["title"],
            "admin_teams": ["mine-team"],
        }
        data.update(overrides)
        return FormConfigAdminForm(data, instance=self.config, for_user=user)

    def test_partner_cannot_grant_other_team(self):
        form = self._form(self.partner, admin_teams=["other-team"])
        self.assertFalse(form.is_valid())
        self.assertIn("admin_teams", form.errors)

    def test_partner_cannot_drop_own_last_team(self):
        form = self._form(self.partner, admin_teams=[])
        self.assertFalse(form.is_valid())
        self.assertIn("admin_teams", form.errors)

    def test_admin_may_grant_any_team(self):
        form = self._form(self.admin, admin_teams=["other-team"])
        self.assertTrue(form.is_valid(), form.errors)

    def test_partner_cannot_repoint_portal_id(self):
        from core.testing import make_portal

        make_portal("other-portal")
        form = self._form(self.partner, portal_id="other-portal")
        self.assertFalse(form.is_valid())
        self.assertIn("portal_id", form.errors)

    def test_portal_id_must_name_a_real_portal_page(self):
        form = self._form(self.admin, portal_id="ghost-portal")
        self.assertFalse(form.is_valid())
        self.assertIn("portal_id", form.errors)


class FormConfigDeleteGuardTests(TestCase):
    """Deleting a portal form with submissions is refused (data-loss guard;
    the DB FK is ON DELETE RESTRICT, this is the friendly layer)."""

    def setUp(self):
        from core.testing import create_mirror_tables, make_admin_user, make_form_config
        from datastore.models import FormConfig

        create_mirror_tables(FormConfig)
        self.config = make_form_config("busy-portal")
        self.client.force_login(make_admin_user())
        self.url = f"/admin/snippets/datastore/formconfig/delete/{self.config.pk}/"

    def test_delete_with_submissions_refused(self):
        from unittest import mock

        from datastore.models import FormConfig

        with mock.patch(
            "datastore.wagtail_hooks._portals_with_submissions",
            return_value={"busy-portal": 3},
        ):
            response = self.client.post(self.url, follow=True)
        self.assertContains(response, "Cannot delete portal forms")
        self.assertTrue(FormConfig.objects.filter(pk=self.config.pk).exists())

    def test_delete_without_submissions_proceeds(self):
        from unittest import mock

        from datastore.models import FormConfig

        with mock.patch(
            "datastore.wagtail_hooks._portals_with_submissions", return_value={}
        ):
            self.client.post(self.url)
        self.assertFalse(FormConfig.objects.filter(pk=self.config.pk).exists())
