"""
Forms for the datastore admin tools (GeoPackage import, thumbnails).

Validation mirrors the backend's GerryDBImportRequest
(backend/app/admin_ops/main.py): layer/table names are interpolated into SQL
identifiers and shell args over there, so they are restricted to word
characters here too, and the gpkg must end in .gpkg.
"""

from django import forms
from django.core.validators import RegexValidator

from datastore.models import DistrictrMap

# Mirrors SQL_IDENTIFIER_PATTERN in backend/app/admin_ops/main.py.
sql_identifier_validator = RegexValidator(
    regex=r"^[a-zA-Z0-9_]+$",
    message="Use only letters, numbers, and underscores.",
)

# Streamed to a temp file by Django, then multipart-uploaded by boto3 — but
# cap it so a stray upload cannot fill the disk.
MAX_GPKG_BYTES = 2 * 1024**3  # 2 GB


class GeoPackageImportForm(forms.Form):
    gpkg_file = forms.FileField(
        label="GeoPackage file",
        required=False,
        help_text="A .gpkg file to upload (max 2 GB).",
    )
    gpkg_path = forms.CharField(
        label="…or existing s3:// path",
        required=False,
        help_text="Skip the upload and import a GeoPackage already in the "
        "bucket, e.g. s3://bucket/gerrydb-uploads/co_blocks.gpkg",
    )
    layer = forms.CharField(
        label="Layer name",
        validators=[sql_identifier_validator],
        help_text="Layer inside the GeoPackage (letters, numbers, underscores).",
    )
    table_name = forms.CharField(
        label="Table name",
        required=False,
        validators=[sql_identifier_validator],
        help_text="Optional gerrydb table name; defaults to the layer name.",
    )
    rm = forms.BooleanField(
        label="Replace existing table",
        required=False,
        help_text="Drop and re-import if the table already exists.",
    )

    def clean_gpkg_file(self):
        gpkg_file = self.cleaned_data.get("gpkg_file")
        if gpkg_file:
            if not gpkg_file.name.lower().endswith(".gpkg"):
                raise forms.ValidationError("File must have a .gpkg extension.")
            if gpkg_file.size > MAX_GPKG_BYTES:
                raise forms.ValidationError("File is larger than 2 GB.")
        return gpkg_file

    def clean_gpkg_path(self):
        gpkg_path = self.cleaned_data.get("gpkg_path", "").strip()
        if gpkg_path:
            if not gpkg_path.startswith("s3://"):
                raise forms.ValidationError("Path must start with s3://")
            if not gpkg_path.endswith(".gpkg"):
                raise forms.ValidationError("Path must end with .gpkg")
        return gpkg_path

    def clean(self):
        cleaned_data = super().clean()
        if cleaned_data.get("gpkg_file") and cleaned_data.get("gpkg_path"):
            raise forms.ValidationError(
                "Provide either a file upload or an s3:// path, not both."
            )
        # Only complain about the missing source when neither field has its
        # own (more specific) error.
        if (
            not cleaned_data.get("gpkg_file")
            and not cleaned_data.get("gpkg_path")
            and not self.has_error("gpkg_file")
            and not self.has_error("gpkg_path")
        ):
            raise forms.ValidationError(
                "Provide a GeoPackage file or an existing s3:// path."
            )
        return cleaned_data


class MapThumbnailForm(forms.Form):
    districtr_map = forms.ModelChoiceField(
        label="Districtr map",
        queryset=DistrictrMap.objects.order_by("name"),
        help_text="Regenerates the blank-map thumbnail from the parent layer.",
    )


class DocumentThumbnailForm(forms.Form):
    document_id = forms.CharField(
        label="Document ID",
        help_text="Private or public document ID; regenerates that plan's "
        "thumbnail from its assignments.",
    )
