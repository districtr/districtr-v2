"""
Meta-level tests for the managed=False mirrors of the Alembic-owned tables.

These deliberately avoid touching the mirrored `public` tables (which do not
exist in the Django test database): they assert on model _meta and on the
pure drift-comparison function with fake schema snapshots. The live-schema
check runs separately via `manage.py check_mirror_drift` (locally and in CI,
after the backend's Alembic migrations).
"""

from django.db import models
from django.test import SimpleTestCase

from datastore.drift import (
    EXCLUDED_COLUMNS,
    compare_columns,
    mirrored_models,
    model_column_spec,
)
from datastore.models import (
    DistrictrMap,
    DistrictrMapOverlays,
    DistrictrMapsToGroups,
    GeoUnitType,
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
