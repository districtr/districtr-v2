"""
managed=False mirrors of the FastAPI/Alembic-owned tables in the `public`
schema.

backend/app/models.py is the source of truth for these table shapes; Alembic
owns the DDL. Django reaches the tables through the connection search_path
(admin,public — see config/settings/base.py) so db_table values must NOT be
schema-qualified. Run `manage.py check_mirror_drift` to verify the mirrors
still match the live schema.

Intentionally NOT mirrored: partitioned tables (parentchildedges,
document.assignments, document.community_assignments), anything in the
`document` schema, and geometry-bearing tables (document.district_unions).
Geometry columns must never be mapped here; list any such intentionally
unmapped columns in datastore.drift.EXCLUDED_COLUMNS.
"""

import uuid as uuid_lib

from django.contrib.postgres.fields import ArrayField
from django.db import models


class MapType(models.TextChoices):
    """Mirrors the Postgres enum `maptype` (backend/app/models.py)."""

    DEFAULT = "default", "Default"
    LOCAL = "local", "Local"
    COMMUNITY = "community", "Community"


class GeoUnitType(models.TextChoices):
    """Mirrors backend GeoUnitType (stored as plain varchar, not a PG enum)."""

    VTD = "vtd", "VTD"
    BLOCK_GROUP = "bg", "Block group"
    BLOCK = "block", "Block"


class OverlayDataType(models.TextChoices):
    """Mirrors the Postgres enum `overlaydatatype`."""

    GEOJSON = "geojson", "GeoJSON"
    PMTILES = "pmtiles", "PMTiles"


class OverlayLayerType(models.TextChoices):
    """Mirrors the Postgres enum `overlaylayertype`."""

    FILL = "fill", "Fill"
    LINE = "line", "Line"
    TEXT = "text", "Text"


class GerryDBTable(models.Model):
    # The table has no PRIMARY KEY constraint in Postgres; `uuid` is
    # UNIQUE NOT NULL and is what other tables conceptually point at, so it
    # serves as the Django pk.
    uuid = models.UUIDField(primary_key=True, default=uuid_lib.uuid4)
    # Must correspond to the layer name in the tileset.
    name = models.CharField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = "gerrydbtable"
        verbose_name = "GerryDB table"
        verbose_name_plural = "GerryDB tables"

    def __str__(self):
        return self.name


class DistrictrMap(models.Model):
    uuid = models.UUIDField(primary_key=True, default=uuid_lib.uuid4)
    name = models.CharField()
    districtr_map_slug = models.CharField(unique=True)
    # Intentionally not an FK (may be a materialized view of two
    # GerryDBTables for shatterable maps) — see backend/app/models.py.
    gerrydb_table_name = models.CharField(blank=True, null=True)
    num_districts = models.IntegerField(blank=True, null=True)
    num_districts_modifiable = models.BooleanField(default=True)
    tiles_s3_path = models.CharField(blank=True, null=True)
    parent_layer = models.ForeignKey(
        GerryDBTable,
        models.DO_NOTHING,
        db_column="parent_layer",
        to_field="name",
        db_constraint=False,
        related_name="maps_as_parent_layer",
    )
    child_layer = models.ForeignKey(
        GerryDBTable,
        models.DO_NOTHING,
        db_column="child_layer",
        to_field="name",
        db_constraint=False,
        related_name="maps_as_child_layer",
        blank=True,
        null=True,
    )
    extent = ArrayField(models.FloatField(), blank=True, null=True)
    visible = models.BooleanField(default=True)
    map_type = models.CharField(choices=MapType.choices, default=MapType.DEFAULT)
    comment = models.CharField(blank=True, null=True)
    parent_geo_unit_type = models.CharField(
        choices=GeoUnitType.choices, blank=True, null=True
    )
    child_geo_unit_type = models.CharField(
        choices=GeoUnitType.choices, blank=True, null=True
    )
    data_source_name = models.CharField(blank=True, null=True)
    statefps = ArrayField(models.CharField(), blank=True, null=True)
    comment_length_limit = models.IntegerField(blank=True, null=True)
    comment_count_limit = models.IntegerField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = "districtrmap"
        verbose_name = "Districtr map"
        verbose_name_plural = "Districtr maps"

    def __str__(self):
        return self.name


class MapGroup(models.Model):
    slug = models.CharField(primary_key=True)
    name = models.CharField()

    class Meta:
        managed = False
        db_table = "map_group"
        verbose_name = "map group"
        verbose_name_plural = "map groups"

    def __str__(self):
        return self.name


class Overlay(models.Model):
    overlay_id = models.UUIDField(primary_key=True, default=uuid_lib.uuid4)
    name = models.CharField()
    description = models.CharField(blank=True, null=True)
    data_type = models.CharField(choices=OverlayDataType.choices)
    layer_type = models.CharField(choices=OverlayLayerType.choices)
    custom_style = models.JSONField(blank=True, null=True)
    source = models.CharField(blank=True, null=True)
    source_layer = models.CharField(blank=True, null=True)
    # Property name for text labels.
    id_property = models.CharField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    updated_at = models.DateTimeField(auto_now=True, null=True)

    class Meta:
        managed = False
        db_table = "overlay"

    def __str__(self):
        # Rich enough to tell apart the line/text/fill overlays that share a
        # data source (the common case) in every dropdown they appear in.
        source_tail = (self.source or "").rstrip("/").rsplit("/", 1)[-1]
        parts = [self.layer_type or "?", self.data_type or "?"]
        if source_tail:
            parts.append(source_tail)
        return f"{self.name} — {' · '.join(parts)}"


class DistrictrMapsToGroups(models.Model):
    # Surrogate integer pk added by the backend specifically so admin tooling
    # like this can edit rows; the column pair stays UNIQUE.
    id = models.AutoField(primary_key=True)
    districtrmap = models.ForeignKey(
        DistrictrMap,
        models.DO_NOTHING,
        db_column="districtrmap_uuid",
        db_constraint=False,
        related_name="group_links",
    )
    group = models.ForeignKey(
        MapGroup,
        models.DO_NOTHING,
        db_column="group_slug",
        db_constraint=False,
        related_name="map_links",
    )

    class Meta:
        managed = False
        db_table = "districtrmaps_to_groups"
        constraints = [
            models.UniqueConstraint(
                fields=["districtrmap", "group"], name="group_map_unique"
            ),
        ]
        verbose_name = "map-to-group link"
        verbose_name_plural = "map-to-group links"

    def __str__(self):
        return f"{self.districtrmap_id} \N{RIGHTWARDS ARROW} {self.group_id}"


class DistrictrMapOverlays(models.Model):
    # Surrogate integer pk added by the backend specifically so admin tooling
    # like this can edit rows; the column pair stays UNIQUE.
    id = models.AutoField(primary_key=True)
    districtr_map = models.ForeignKey(
        DistrictrMap,
        models.DO_NOTHING,
        db_column="districtr_map_id",
        db_constraint=False,
        related_name="overlay_links",
    )
    overlay = models.ForeignKey(
        Overlay,
        models.DO_NOTHING,
        db_column="overlay_id",
        db_constraint=False,
        related_name="map_links",
    )

    class Meta:
        managed = False
        db_table = "districtrmap_overlays"
        constraints = [
            models.UniqueConstraint(
                fields=["districtr_map", "overlay"], name="districtrmap_overlays_unique"
            ),
        ]
        verbose_name = "map-to-overlay link"
        verbose_name_plural = "map-to-overlay links"

    def __str__(self):
        return f"{self.districtr_map_id} \N{RIGHTWARDS ARROW} {self.overlay_id}"


# ---------------------------------------------------------------------------
# comments-schema mirror
# ---------------------------------------------------------------------------

# The submission field registry — the fixed vocabulary a portal's form may
# draw from. LOCKSTEP CONTRACT with backend/app/submissions/fields.py
# (validation) and app/src/app/components/Forms/fieldRegistry.tsx
# (rendering): adding a field means touching all three.
SUBMISSION_FIELD_CHOICES = [
    ("salutation", "Salutation"),
    ("first_name", "First name"),
    ("last_name", "Last name"),
    ("email", "Email (never shown publicly)"),
    ("title", "Title"),
    ("comment", "Comment"),
    ("place", "Place"),
    ("state", "State"),
    ("zip_code", "Zip code"),
]


class FormConfig(models.Model):
    """Mirror of comments.form_configs (backend/app/submissions/models.py).

    One row per portal: which registry fields its submission form shows,
    which are required, and which teams administer its submissions. The
    backend validates submissions against this row; the CMS edits it here
    and injects it into the portal page's form blocks (content/api.py).

    Unlike the other mirrors this table lives in the `comments` schema, which
    is NOT on the connection search_path — the db_table quoting trick below
    schema-qualifies it. Deliberately not added to the search_path: that
    would expose every legacy comment table to ORM name collisions during
    the transition.
    """

    id = models.AutoField(primary_key=True)
    # max_length mirrors the backend's String(255): without it Django puts
    # no form-level cap while the column truncates at 255 via DataError.
    portal_id = models.CharField(max_length=255, unique=True)
    name = models.CharField(max_length=255)
    fields = ArrayField(models.CharField(max_length=64), default=list)
    required_fields = ArrayField(models.CharField(max_length=64), default=list)
    require_email_confirm = models.BooleanField(default=False)
    admin_teams = ArrayField(models.CharField(max_length=255), default=list)
    # How the portal collects map submissions; see backend
    # app/submissions/models.py::CollectionMode for the vocabulary.
    collection_mode = models.CharField(max_length=16, default="prompt")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'comments"."form_configs'
        verbose_name = "portal form"
        verbose_name_plural = "portal forms"

    def __str__(self):
        return f"{self.name} ({self.portal_id})"
