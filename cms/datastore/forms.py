"""
Forms for the datastore admin tools (thumbnails, overlay uploads, map module
composition).

Validation mirrors the backend's admin_ops request models
(backend/app/admin_ops/main.py): layer names are interpolated into SQL
identifiers over there, so they are restricted to word characters here too.
"""

import json

from django import forms
from django.core.validators import RegexValidator

from authapi.teams import scoped_queryset, user_is_team_scoped
from datastore.models import (
    DistrictrMap,
    GerryDBTable,
    MapGroup,
    MapType,
    Overlay,
    OverlayDataType,
    OverlayLayerType,
)

# Mirrors SQL_IDENTIFIER_PATTERN in backend/app/admin_ops/main.py.
sql_identifier_validator = RegexValidator(
    regex=r"^[a-zA-Z0-9_]+$",
    message="Use only letters, numbers, and underscores.",
)

# Mirrors the slug shape the frontend routes on (lowercase kebab-case).
districtr_map_slug_validator = RegexValidator(
    regex=r"^[a-z0-9-]+$",
    message="Use only lowercase letters, numbers, and hyphens.",
)

# Streamed to a temp file by Django, then multipart-uploaded by boto3 — but
# cap it so a stray upload cannot fill the disk.
MAX_OVERLAY_BYTES = 1024**3  # 1 GB

OVERLAY_EXTENSIONS = (".geojson", ".pmtiles")


def overlay_data_type(source: str) -> str | None:
    """Infer the Overlay data_type from a filename/URL suffix."""
    lowered = source.lower()
    if lowered.endswith(".geojson"):
        return OverlayDataType.GEOJSON
    if lowered.endswith(".pmtiles"):
        return OverlayDataType.PMTILES
    return None


class OverlayUploadForm(forms.Form):
    overlay_file = forms.FileField(
        label="Overlay file",
        required=False,
        help_text="A .geojson or .pmtiles file to upload (max 1 GB). "
        "Stored under overlays/ in the upload bucket; the overlay's source "
        "URL is built from OVERLAY_PUBLIC_URL_BASE (the CDN fronting the "
        "bucket) or, when that is unset, the raw s3:// path.",
    )
    overlay_path = forms.CharField(
        label="…or existing URL / s3:// path",
        required=False,
        help_text="Skip the upload and point at a .geojson/.pmtiles already "
        "hosted somewhere, e.g. "
        "https://tilesets1.cdn.districtr.org/overlays/tx_cities.pmtiles "
        "or s3://bucket/overlays/tx_cities.pmtiles",
    )
    name = forms.CharField(
        label="Name",
        help_text="Display name shown in the overlay picker.",
    )
    description = forms.CharField(
        label="Description",
        required=False,
        widget=forms.Textarea(attrs={"rows": 2}),
    )
    layer_types = forms.MultipleChoiceField(
        label="Layer types",
        choices=OverlayLayerType.choices,
        initial=[OverlayLayerType.FILL],
        widget=forms.CheckboxSelectMultiple,
        help_text="One overlay is created per selected type, all from this "
        "same source — pick line + text to label the same boundaries file, "
        "the frequent case. Names get a type suffix when several are made.",
    )
    source_layer = forms.CharField(
        label="Source layer",
        required=False,
        help_text="Layer name inside the PMTiles archive — required for "
        ".pmtiles overlays, not applicable to GeoJSON.",
    )
    id_property = forms.CharField(
        label="ID property",
        required=False,
        help_text="Optional feature property used for labels (relevant for "
        "text layers).",
    )
    custom_style = forms.CharField(
        label="Custom style",
        required=False,
        widget=forms.Textarea(attrs={"rows": 4}),
        help_text="Optional JSON of MapLibre paint/layout overrides.",
    )
    districtr_maps = forms.ModelMultipleChoiceField(
        label="Attach to Districtr maps",
        queryset=DistrictrMap.objects.order_by("name"),
        required=False,
        help_text="The overlay becomes available on the selected maps "
        "(hold Ctrl/Cmd to select several; may be empty).",
    )

    def __init__(self, *args, user=None, **kwargs):
        super().__init__(*args, **kwargs)
        # Team-scoped users (super partners) may only attach overlays to
        # their own teams' maps. ModelMultipleChoiceField validates submitted
        # IDs against this queryset, so narrowing it closes the POST path,
        # not just the visible choices.
        if user is not None and user_is_team_scoped(user):
            self.fields["districtr_maps"].queryset = scoped_queryset(
                DistrictrMap, "team_links__team_id", user
            ).order_by("name")

    def clean_overlay_file(self):
        overlay_file = self.cleaned_data.get("overlay_file")
        if overlay_file:
            if overlay_data_type(overlay_file.name) is None:
                raise forms.ValidationError(
                    "File must have a .geojson or .pmtiles extension."
                )
            if overlay_file.size > MAX_OVERLAY_BYTES:
                raise forms.ValidationError("File is larger than 1 GB.")
        return overlay_file

    def clean_overlay_path(self):
        overlay_path = self.cleaned_data.get("overlay_path", "").strip()
        if overlay_path:
            if not overlay_path.startswith(("s3://", "http://", "https://")):
                raise forms.ValidationError(
                    "Path must start with s3://, http://, or https://"
                )
            if overlay_data_type(overlay_path) is None:
                raise forms.ValidationError("Path must end with .geojson or .pmtiles")
        return overlay_path

    def clean_custom_style(self):
        custom_style = self.cleaned_data.get("custom_style", "").strip()
        if not custom_style:
            return None
        try:
            decoded = json.loads(custom_style)
        except json.JSONDecodeError as exc:
            raise forms.ValidationError(f"Invalid JSON: {exc}")
        # The backend contract (OverlayPublic.custom_style: dict | None)
        # response-validates on every map load, so a stored non-object would
        # 500 affected maps.
        if not isinstance(decoded, dict):
            raise forms.ValidationError(
                "Custom style must be a JSON object of paint/layout overrides."
            )
        return decoded

    def clean(self):
        cleaned_data = super().clean()
        overlay_file = cleaned_data.get("overlay_file")
        overlay_path = cleaned_data.get("overlay_path")
        if overlay_file and overlay_path:
            raise forms.ValidationError(
                "Provide either a file upload or an existing path, not both."
            )
        # Only complain about the missing source when neither field has its
        # own (more specific) error.
        if (
            not overlay_file
            and not overlay_path
            and not self.has_error("overlay_file")
            and not self.has_error("overlay_path")
        ):
            raise forms.ValidationError(
                "Provide an overlay file or an existing URL/s3:// path."
            )

        data_type = overlay_data_type(
            overlay_file.name if overlay_file else (overlay_path or "")
        )
        cleaned_data["data_type"] = data_type
        if data_type == OverlayDataType.PMTILES and not cleaned_data.get(
            "source_layer"
        ):
            self.add_error(
                "source_layer", "Source layer is required for PMTiles overlays."
            )
        if data_type == OverlayDataType.GEOJSON and cleaned_data.get("source_layer"):
            self.add_error(
                "source_layer", "Source layer only applies to PMTiles overlays."
            )
        return cleaned_data


class ComposeMapForm(forms.Form):
    name = forms.CharField(
        label="Name",
        help_text="Display name for the new map module.",
    )
    districtr_map_slug = forms.CharField(
        label="Slug",
        validators=[districtr_map_slug_validator],
        help_text="URL slug for the module (lowercase letters, numbers, and "
        "hyphens, e.g. co-blocks-demo). Must not already exist.",
    )
    parent_layer = forms.ModelChoiceField(
        label="Parent layer",
        queryset=GerryDBTable.objects.order_by("name"),
        help_text="GerryDB table the module is drawn on.",
    )
    child_layer = forms.ModelChoiceField(
        label="Child layer",
        queryset=GerryDBTable.objects.order_by("name"),
        required=False,
        help_text="Optional finer-grained layer for shatterable maps; must "
        "differ from the parent layer.",
    )
    num_districts = forms.IntegerField(
        label="Number of districts",
        min_value=1,
        max_value=200,
    )
    tiles_s3_path = forms.CharField(
        label="Tiles S3 path",
        required=False,
        help_text="Optional tileset path inside the bucket, e.g. "
        "tilesets/co_blocks.pmtiles; leave blank to use the backend's "
        "default for the parent layer.",
    )
    map_group = forms.ModelChoiceField(
        label="Map group",
        queryset=MapGroup.objects.order_by("name"),
        required=False,
        help_text="Optional group the module is listed under.",
    )
    map_type = forms.ChoiceField(
        label="Map type",
        choices=MapType.choices,
        initial=MapType.DEFAULT,
    )
    overlays = forms.ModelMultipleChoiceField(
        label="Overlays",
        queryset=Overlay.objects.order_by("name"),
        required=False,
        widget=forms.CheckboxSelectMultiple,
        help_text="Overlays to attach to the new module.",
    )

    def clean_districtr_map_slug(self):
        slug = self.cleaned_data["districtr_map_slug"]
        if DistrictrMap.objects.filter(districtr_map_slug=slug).exists():
            raise forms.ValidationError(
                f"A map module with slug '{slug}' already exists."
            )
        return slug

    def clean(self):
        cleaned_data = super().clean()
        parent_layer = cleaned_data.get("parent_layer")
        child_layer = cleaned_data.get("child_layer")
        if parent_layer and child_layer and parent_layer == child_layer:
            self.add_error(
                "child_layer", "Child layer must differ from the parent layer."
            )
        return cleaned_data
