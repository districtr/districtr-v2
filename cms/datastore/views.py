"""
Admin tool views: map module composition, overlay upload, and thumbnail
regeneration.

Registered under /admin/ via the register_admin_urls hook in
datastore/wagtail_hooks.py, so Wagtail's require_admin_access already gates
anonymous users; on top of that, every tool requires a datastore add
permission (admin + super_partner via authapi.0007).

GPKG import was removed from the admin UI 2026-08-06 (raw data uploads are
deferred); the service plumbing (services.upload_gpkg/schedule_import and the
backend endpoint) is kept for its return.
"""

import logging
import time
import uuid

from botocore.exceptions import BotoCoreError, ClientError
from django.core.exceptions import ImproperlyConfigured
from django.db import DatabaseError, transaction
from django.http import HttpResponseNotAllowed
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.utils.text import get_valid_filename
from requests import RequestException
from wagtail.admin import messages
from wagtail.admin.auth import permission_required

from datastore import services
from datastore.forms import (
    ComposeMapForm,
    DocumentThumbnailForm,
    OverlayUploadForm,
)
from datastore.models import DistrictrMap, DistrictrMapOverlays, Overlay

logger = logging.getLogger(__name__)

# The mirrors are read-mostly; the add permissions mark "may run data ops".
# add_districtrmap/add_overlay: admin + super_partner (authapi.0007).
DATASTORE_ADMIN_PERMISSION = "datastore.add_districtrmap"
OVERLAY_ADMIN_PERMISSION = "datastore.add_overlay"


def _upload_key(filename: str) -> str:
    """Timestamped object key so re-uploads never clobber each other."""
    return f"{timezone.now():%Y%m%d-%H%M%S}-{get_valid_filename(filename)}"


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


def _assign_composed_map_to_teams(user, slug, timeout_seconds=10):
    """Assign a freshly composed module to the composer's teams.

    The backend composes asynchronously, so the DistrictrMap row appears a
    moment after the 202. For team-scoped composers (super partners) the
    module would otherwise be invisible to its own creator until an admin
    assigns it. Returns the team names on success, "" when the user is
    unscoped (nothing to do), or None when the module did not appear in time.
    # ponytail: short in-request poll; move to a background assign if compose
    # ever becomes slow.
    """
    from authapi.models import TeamDistrictrMap
    from authapi.teams import team_ids_for_user, user_is_team_scoped

    if not user_is_team_scoped(user):
        return ""
    deadline = time.monotonic() + timeout_seconds
    districtr_map = None
    while time.monotonic() < deadline:
        districtr_map = DistrictrMap.objects.filter(districtr_map_slug=slug).first()
        if districtr_map is not None:
            break
        time.sleep(0.5)
    if districtr_map is None:
        return None
    names = []
    from authapi.models import Team

    for team in Team.objects.filter(pk__in=team_ids_for_user(user)):
        TeamDistrictrMap.objects.get_or_create(team=team, districtr_map=districtr_map)
        names.append(team.name)
    return ", ".join(sorted(names))


@permission_required(DATASTORE_ADMIN_PERMISSION)
def compose_map(request):
    form = ComposeMapForm()
    if request.method == "POST":
        form = ComposeMapForm(request.POST)
        if form.is_valid():
            slug = form.cleaned_data["districtr_map_slug"]
            child_layer = form.cleaned_data["child_layer"]
            map_group = form.cleaned_data["map_group"]
            overlays = form.cleaned_data["overlays"]
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
                    overlay_ids=[str(o.overlay_id) for o in overlays],
                )
            except (services.BackendAPIError, RequestException) as exc:
                logger.exception("Map module composition failed for %s", slug)
                messages.error(request, f"Composition failed: {exc}")
            else:
                assigned = _assign_composed_map_to_teams(request.user, slug)
                extras = []
                if overlays:
                    extras.append(f"{len(overlays)} overlay(s) attached")
                if assigned:
                    extras.append(f"assigned to your team(s): {assigned}")
                elif assigned is None:
                    extras.append(
                        "team assignment pending — once the module appears, "
                        "an admin can assign it on its edit page"
                    )
                suffix = f" ({'; '.join(extras)})" if extras else ""
                messages.success(
                    request,
                    "Module composition scheduled — it will appear in "
                    "Edit map modules shortly; it is created hidden until "
                    f"you flip visible{suffix}.",
                )
                return redirect("datastore_compose_map")

    return render(
        request,
        "datastore/compose_map.html",
        {"form": form},
    )


@permission_required(DATASTORE_ADMIN_PERMISSION)
def thumbnails(request):
    """Plan (document) thumbnails only — map thumbnails regenerate from the
    map's own edit page (regenerate_map_thumbnail below)."""
    form = DocumentThumbnailForm()

    if request.method == "POST":
        form = DocumentThumbnailForm(request.POST)
        if form.is_valid():
            document_id = form.cleaned_data["document_id"].strip()
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
        {"form": form},
    )


@permission_required(DATASTORE_ADMIN_PERMISSION)
def regenerate_map_thumbnail(request, pk):
    """POST target for the "Regenerate thumbnail" button on the DistrictrMap
    edit page."""
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    districtr_map = get_object_or_404(DistrictrMap, pk=pk)
    slug = districtr_map.districtr_map_slug
    try:
        services.regenerate_map_thumbnail(slug)
    except (services.BackendAPIError, RequestException) as exc:
        logger.exception("Map thumbnail regeneration failed for %s", slug)
        messages.error(request, f"Thumbnail regeneration failed: {exc}")
    else:
        messages.success(request, f"Thumbnail regeneration scheduled for “{slug}”.")
    return redirect("wagtailsnippets_datastore_districtrmap:edit", districtr_map.pk)
