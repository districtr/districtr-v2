"""
Admin tool views: GeoPackage import, thumbnail regeneration, overlay upload,
and map module composition.

Registered under /admin/ via the register_admin_urls hook in
datastore/wagtail_hooks.py, so Wagtail's require_admin_access already gates
anonymous users; on top of that, every tool requires a datastore add
permission that only the admin group holds (0002 data migration).
"""

import logging
import uuid

from botocore.exceptions import BotoCoreError, ClientError
from django.core.exceptions import ImproperlyConfigured
from django.db import DatabaseError, transaction
from django.shortcuts import redirect, render
from django.utils import timezone
from django.utils.text import get_valid_filename
from requests import RequestException
from wagtail.admin import messages
from wagtail.admin.auth import permission_required

from datastore import services
from datastore.forms import (
    ComposeMapForm,
    DocumentThumbnailForm,
    GeoPackageImportForm,
    MapThumbnailForm,
    OverlayUploadForm,
)
from datastore.models import DistrictrMapOverlays, Overlay

logger = logging.getLogger(__name__)

# The mirrors are read-mostly; the add permissions mark "may run data ops".
DATASTORE_ADMIN_PERMISSION = "datastore.add_districtrmap"
OVERLAY_ADMIN_PERMISSION = "datastore.add_overlay"


def _upload_key(filename: str) -> str:
    """Timestamped object key so re-uploads never clobber each other."""
    return f"{timezone.now():%Y%m%d-%H%M%S}-{get_valid_filename(filename)}"


@permission_required(DATASTORE_ADMIN_PERMISSION)
def import_gpkg(request):
    form = GeoPackageImportForm()
    if request.method == "POST":
        form = GeoPackageImportForm(request.POST, request.FILES)
        if form.is_valid():
            layer = form.cleaned_data["layer"]
            gpkg_path = form.cleaned_data["gpkg_path"]
            try:
                if form.cleaned_data["gpkg_file"]:
                    gpkg_file = form.cleaned_data["gpkg_file"]
                    gpkg_path = services.upload_gpkg(
                        gpkg_file, _upload_key(gpkg_file.name)
                    )
                result = services.schedule_import(
                    gpkg_path=gpkg_path,
                    layer=layer,
                    table_name=form.cleaned_data["table_name"] or None,
                    rm=form.cleaned_data["rm"],
                )
            except (
                services.BackendAPIError,
                ImproperlyConfigured,
                BotoCoreError,
                ClientError,
                RequestException,
            ) as exc:
                logger.exception("GeoPackage import failed for layer %s", layer)
                messages.error(request, f"Import failed: {exc}")
            else:
                messages.success(
                    request,
                    f"Import scheduled for layer “{result.get('layer', layer)}” "
                    f"from {gpkg_path}. The backend processes it in the "
                    "background; check the GerryDB tables listing shortly.",
                )
                return redirect("datastore_import_gpkg")

    return render(
        request,
        "datastore/import_gpkg.html",
        {"form": form},
    )


@permission_required(OVERLAY_ADMIN_PERMISSION)
def upload_overlay(request):
    form = OverlayUploadForm()
    if request.method == "POST":
        form = OverlayUploadForm(request.POST, request.FILES)
        if form.is_valid():
            name = form.cleaned_data["name"]
            source = form.cleaned_data["overlay_path"]
            districtr_maps = form.cleaned_data["districtr_maps"]
            try:
                if form.cleaned_data["overlay_file"]:
                    overlay_file = form.cleaned_data["overlay_file"]
                    source = services.upload_overlay(
                        overlay_file, _upload_key(overlay_file.name)
                    )
                with transaction.atomic():
                    overlay = Overlay.objects.create(
                        overlay_id=uuid.uuid4(),
                        name=name,
                        description=form.cleaned_data["description"] or None,
                        data_type=form.cleaned_data["data_type"],
                        layer_type=form.cleaned_data["layer_type"],
                        custom_style=form.cleaned_data["custom_style"],
                        source=source,
                        source_layer=form.cleaned_data["source_layer"] or None,
                        id_property=form.cleaned_data["id_property"] or None,
                    )
                    for districtr_map in districtr_maps:
                        DistrictrMapOverlays.objects.create(
                            districtr_map=districtr_map, overlay=overlay
                        )
            except (
                ImproperlyConfigured,
                BotoCoreError,
                ClientError,
                DatabaseError,
            ) as exc:
                logger.exception("Overlay upload failed for %s", name)
                messages.error(request, f"Overlay upload failed: {exc}")
            else:
                messages.success(
                    request,
                    f"Overlay “{name}” created from {source} and attached to "
                    f"{len(districtr_maps)} map(s).",
                )
                return redirect("datastore_upload_overlay")

    return render(
        request,
        "datastore/upload_overlay.html",
        {"form": form},
    )


@permission_required(DATASTORE_ADMIN_PERMISSION)
def compose_map(request):
    form = ComposeMapForm()
    if request.method == "POST":
        form = ComposeMapForm(request.POST)
        if form.is_valid():
            slug = form.cleaned_data["districtr_map_slug"]
            child_layer = form.cleaned_data["child_layer"]
            map_group = form.cleaned_data["map_group"]
            try:
                services.schedule_compose(
                    name=form.cleaned_data["name"],
                    districtr_map_slug=slug,
                    parent_layer=form.cleaned_data["parent_layer"].name,
                    child_layer=child_layer.name if child_layer else None,
                    num_districts=form.cleaned_data["num_districts"],
                    tiles_s3_path=form.cleaned_data["tiles_s3_path"] or None,
                    group_slug=map_group.slug if map_group else None,
                    map_type=form.cleaned_data["map_type"],
                )
            except (services.BackendAPIError, RequestException) as exc:
                logger.exception("Map module composition failed for %s", slug)
                messages.error(request, f"Composition failed: {exc}")
            else:
                messages.success(
                    request,
                    "Module composition scheduled — it will appear in "
                    "Districtr maps shortly; it is created hidden until you "
                    "flip visible.",
                )
                return redirect("datastore_compose_map")

    return render(
        request,
        "datastore/compose_map.html",
        {"form": form},
    )


@permission_required(DATASTORE_ADMIN_PERMISSION)
def thumbnails(request):
    map_form = MapThumbnailForm(prefix="map")
    document_form = DocumentThumbnailForm(prefix="document")

    if request.method == "POST":
        if "map_submit" in request.POST:
            map_form = MapThumbnailForm(request.POST, prefix="map")
            if map_form.is_valid():
                slug = map_form.cleaned_data["districtr_map"].districtr_map_slug
                try:
                    services.regenerate_map_thumbnail(slug)
                except (services.BackendAPIError, RequestException) as exc:
                    logger.exception("Map thumbnail regeneration failed for %s", slug)
                    messages.error(request, f"Thumbnail regeneration failed: {exc}")
                else:
                    messages.success(
                        request,
                        f"Thumbnail regeneration scheduled for “{slug}”.",
                    )
                    return redirect("datastore_thumbnails")
        elif "document_submit" in request.POST:
            document_form = DocumentThumbnailForm(request.POST, prefix="document")
            if document_form.is_valid():
                document_id = document_form.cleaned_data["document_id"].strip()
                try:
                    services.regenerate_document_thumbnail(document_id)
                except (services.BackendAPIError, RequestException) as exc:
                    logger.exception(
                        "Document thumbnail regeneration failed for %s", document_id
                    )
                    messages.error(request, f"Thumbnail regeneration failed: {exc}")
                else:
                    messages.success(
                        request,
                        f"Thumbnail regeneration scheduled for document "
                        f"“{document_id}”.",
                    )
                    return redirect("datastore_thumbnails")

    return render(
        request,
        "datastore/thumbnails.html",
        {"map_form": map_form, "document_form": document_form},
    )
