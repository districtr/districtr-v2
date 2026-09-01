"""
The Portals hub: the portal-first admin surface.

One index (your portals, with everything a portal needs one click away), a
per-portal GALLERY that doubles as the takedown surface (there is no review
workflow — submissions are public on arrival; admins can hide abusive
material or toggle the nsfw blur), and a per-portal METRICS table over the
backend's evaluation endpoint.

All data round-trips through the FastAPI backend with a token minted for the
acting user, so scope and teams×admin_teams enforcement stays there
(moderation/services.py). Registered under /admin/ via register_admin_urls
(portals/wagtail_hooks.py), so Wagtail's require_admin_access gates anonymous
users; the group gates below only control access to the pages — the backend
re-checks everything.
"""

import logging
import time

from django.conf import settings
from django.http import (
    Http404,
    HttpResponseBadRequest,
    HttpResponseNotAllowed,
    JsonResponse,
)
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils.http import url_has_allowed_host_and_scheme
from requests import RequestException
from wagtail.admin import messages
from wagtail.admin.auth import permission_denied, user_passes_test

from authapi.teams import team_slugs_for_user, user_is_unscoped_admin
from moderation import services
from moderation.services import BackendAPIError

logger = logging.getLogger(__name__)

PORTAL_EDITOR_GROUPS = frozenset({"admin", "partner", "super_partner"})

PAGE_SIZE = 20

# The two takedown actions; anything else in a POST is rejected.
SUBMISSION_ACTIONS = {"nsfw", "hidden"}

# Tiny per-process cache for derived metric rows: repeated page loads must
# not re-hit the (potentially expensive) evaluation endpoint.
_METRICS_CACHE: dict[int, tuple[float, dict]] = {}
_METRICS_CACHE_TTL = 60
# Per-(portal, user) membership sets so a 100-row metrics page doesn't issue
# 100 admin-list calls; same TTL as the metrics rows.
_MEMBERSHIP_CACHE: dict[tuple[str, int], tuple[float, set]] = {}


def _prune(cache: dict, ttl: float) -> None:
    """Drop expired entries on insert — the caches are per-process dicts and
    would otherwise grow for the worker's lifetime."""
    now = time.monotonic()
    for key in [k for k, (ts, _) in cache.items() if now - ts >= ttl]:
        cache.pop(key, None)


def _portal_member_ids(user, slug: str) -> set:
    """public_ids of this portal's SUBMITTED map-bearing submissions.

    status=submitted matters twice: it keeps the guard aligned with the
    rows the metrics page renders, and it keeps draft submissions' LIVE,
    pre-consent maps out of reach of a hand-edited row URL.
    """
    key = (slug, user.pk)
    cached = _MEMBERSHIP_CACHE.get(key)
    if cached and time.monotonic() - cached[0] < _METRICS_CACHE_TTL:
        return cached[1]
    member = services.list_submissions(
        user, portal_id=slug, status="submitted", has_map="true", limit=100
    )
    ids = {e.get("map_public_id") for e in member}
    _prune(_MEMBERSHIP_CACHE, _METRICS_CACHE_TTL)
    _MEMBERSHIP_CACHE[key] = (time.monotonic(), ids)
    return ids


def group_required(groups):
    """Allow superusers and members of `groups`; else Wagtail's standard
    permission-denied response (redirect to admin home with an error)."""
    return user_passes_test(
        lambda user: user.is_superuser or user.groups.filter(name__in=groups).exists()
    )


def accessible_portals(user):
    """TagPages whose submissions the user administers: all portals for
    admins/superusers; for everyone else, the portals whose
    FormConfig.admin_teams intersects their team slugs — the same rule the
    backend enforces via the JWT teams claim. A team-less non-admin gets
    NOTHING (fail closed, matching the backend's teams: [] -> 403): this
    list also gates add_to_portal_gallery, a pure CMS write the backend
    never re-checks."""
    from wagtail.models import Locale

    from content.models import TagPage
    from datastore.models import FormConfig

    portals = TagPage.objects.filter(locale=Locale.get_default()).order_by("title")
    if not user_is_unscoped_admin(user):
        team_portals = FormConfig.objects.filter(
            admin_teams__overlap=team_slugs_for_user(user)
        ).values_list("portal_id", flat=True)
        portals = portals.filter(slug__in=list(team_portals))
    return portals


def _get_portal_or_denied(request, slug):
    portal = accessible_portals(request.user).filter(slug=slug).first()
    if portal is None:
        return None, permission_denied(request)
    return portal, None


def _form_config_for(slug):
    from datastore.models import FormConfig

    return FormConfig.objects.filter(portal_id=slug).first()


@group_required(PORTAL_EDITOR_GROUPS)
def portals_index(request):
    """Every portal you administer, with its collection mode and the links
    that matter: edit page, edit form, gallery, metrics, view live."""
    from datastore.models import FormConfig

    portals = list(accessible_portals(request.user))
    configs = {
        c.portal_id: c
        for c in FormConfig.objects.filter(portal_id__in=[p.slug for p in portals])
    }
    rows = [
        {
            "page": portal,
            "config": configs.get(portal.slug),
            "edit_page_url": reverse("wagtailadmin_pages:edit", args=[portal.pk]),
            "gallery_url": reverse("portals_gallery", args=[portal.slug]),
            "metrics_url": reverse("portals_metrics", args=[portal.slug]),
            "edit_form_url": (
                reverse(
                    "wagtailsnippets_datastore_formconfig:edit",
                    args=[configs[portal.slug].pk],
                )
                if portal.slug in configs
                else None
            ),
        }
        for portal in portals
    ]
    return render(request, "portals/index.html", {"rows": rows})


def _prep_entry(entry: dict) -> dict:
    """Reshape a SubmissionAdmin dict for the templates: pull the headline
    fields out of the sparse `fields` dict and keep the rest as rows."""
    fields = dict(entry.get("fields") or {})
    entry["field_title"] = fields.pop("title", "")
    entry["field_comment"] = fields.pop("comment", "")
    name = " ".join(
        part
        for part in (
            fields.pop("salutation", ""),
            fields.pop("first_name", ""),
            fields.pop("last_name", ""),
        )
        if part
    )
    entry["field_name"] = name
    entry["field_rows"] = sorted(fields.items())
    return entry


@group_required(PORTAL_EDITOR_GROUPS)
def portal_gallery(request, slug):
    """The portal's submissions — and the takedown surface.

    Everything is public by default; the actions here are Hide/Restore (hard
    takedown of abusive material) and Blur/Unblur (the nsfw shield), plus a
    badge when a visitor reported an entry. Inline filters replace the old
    review queues.
    """
    portal, denied = _get_portal_or_denied(request, slug)
    if denied:
        return denied

    try:
        page = max(int(request.GET.get("p", 1)), 1)
    except ValueError:
        page = 1
    params = {
        "portal_id": slug,
        "offset": (page - 1) * PAGE_SIZE,
        "limit": PAGE_SIZE + 1,
    }
    # Inline filters (blank = no filter). Whitelisted: `status` accepts
    # draft|submitted; hidden/flagged/nsfw/has_map accept 1|0. Anything else
    # is dropped rather than forwarded (a junk value would 422 at the
    # backend and paint the raw error banner).
    for key in ("hidden", "flagged", "nsfw", "has_map"):
        value = request.GET.get(key, "")
        if value in ("1", "0"):
            params[key] = "true" if value == "1" else "false"
    if request.GET.get("status") in ("draft", "submitted"):
        params["status"] = request.GET["status"]

    entries, error = [], None
    try:
        entries = services.list_submissions(request.user, **params)
    except (BackendAPIError, RequestException) as exc:
        logger.exception("Portal gallery fetch failed")
        error = str(exc)
    has_next = len(entries) > PAGE_SIZE
    entries = [_prep_entry(e) for e in entries[:PAGE_SIZE]]

    # One batched, public metadata call decorates map entries with their
    # name/module/status; thumbnails come straight off the backend redirect.
    documents = {}
    map_ids = [e["map_public_id"] for e in entries if e.get("map_public_id")]
    if map_ids:
        try:
            documents = {
                d["public_id"]: d for d in services.get_documents_list(map_ids)
            }
        except (BackendAPIError, RequestException):
            logger.exception("Document metadata fetch failed (gallery still renders)")
    for entry in entries:
        entry["document"] = documents.get(entry.get("map_public_id"))

    querystring = request.GET.copy()
    querystring.pop("p", None)
    return render(
        request,
        "portals/gallery.html",
        {
            "portal": portal,
            "config": _form_config_for(slug),
            "entries": entries,
            "error": error,
            "page": page,
            "prev_page": page - 1,
            "next_page": page + 1,
            "has_next": has_next,
            "base_qs": querystring.urlencode(),
            "backend_url": settings.BACKEND_API_URL,
            "filters": {
                key: request.GET.get(key, "")
                for key in ("status", "hidden", "flagged", "nsfw", "has_map")
            },
        },
    )


@group_required(PORTAL_EDITOR_GROUPS)
def portal_metrics(request, slug):
    """One row per submitted map; the metric cells fill in lazily via
    per-row fetches against the JSON proxy below (a cold evaluation can take
    many seconds — never block the page on it)."""
    portal, denied = _get_portal_or_denied(request, slug)
    if denied:
        return denied

    entries, error = [], None
    try:
        entries = services.list_submissions(
            request.user, portal_id=slug, status="submitted", has_map="true", limit=100
        )
    except (BackendAPIError, RequestException) as exc:
        logger.exception("Portal metrics fetch failed")
        error = str(exc)

    documents = {}
    map_ids = [e["map_public_id"] for e in entries if e.get("map_public_id")]
    if map_ids:
        try:
            documents = {
                d["public_id"]: d for d in services.get_documents_list(map_ids)
            }
        except (BackendAPIError, RequestException):
            logger.exception("Document metadata fetch failed (metrics still render)")

    rows = [
        {
            "entry": _prep_entry(e),
            "document": documents.get(e.get("map_public_id")),
            "public_id": e.get("map_public_id"),
        }
        for e in entries
        if e.get("map_public_id")
    ]
    return render(
        request,
        "portals/metrics.html",
        {
            "portal": portal,
            "rows": rows,
            "error": error,
            "backend_url": settings.BACKEND_API_URL,
        },
    )


@group_required(PORTAL_EDITOR_GROUPS)
def portal_metrics_row(request, slug, public_id: int):
    """JSON proxy for one map's derived metrics.

    Guards that the map belongs to one of this portal's submissions (no
    metric-fishing by URL), then calls the backend evaluation endpoint with a
    raised timeout and returns the derived row. Cached briefly per process.
    """
    portal, denied = _get_portal_or_denied(request, slug)
    if denied:
        return denied

    try:
        member_ids = _portal_member_ids(request.user, slug)
    except (BackendAPIError, RequestException) as exc:
        return JsonResponse({"error": str(exc)}, status=502)
    if public_id not in member_ids:
        raise Http404

    cached = _METRICS_CACHE.get(public_id)
    if cached and time.monotonic() - cached[0] < _METRICS_CACHE_TTL:
        return JsonResponse(cached[1])

    try:
        envelope = services.get_document_evaluation(
            public_id, services.mint_backend_session()
        )
    except (BackendAPIError, RequestException) as exc:
        logger.exception("Evaluation fetch failed for %s", public_id)
        return JsonResponse({"error": str(exc)}, status=502)

    metrics = envelope.get("metrics") or {}
    assigned = metrics.get("assigned_units") or {}
    deviation = metrics.get("population_deviation") or {}
    unassigned = metrics.get("unassigned_population") or {}
    contiguous = metrics.get("contiguous") or {}
    # Derivations mirror the frontend EvalPanel/BasicsSection.tsx: complete
    # counts fully-split units as assigned and requires zero partially
    # assigned units.
    row = {
        "public_id": public_id,
        "complete": (
            (
                (assigned.get("assigned_count") or 0)
                + (assigned.get("split_count") or 0)
                == assigned.get("total_count")
                and not assigned.get("partially_assigned_count")
            )
            if assigned.get("total_count")
            else None
        ),
        "assigned_count": assigned.get("assigned_count"),
        "total_count": assigned.get("total_count"),
        "districts_drawn": len(contiguous) if contiguous else None,
        "top_to_bottom_deviation": deviation.get("top_to_bottom_deviation"),
        "unassigned_population": unassigned.get("unassigned_population"),
        "all_contiguous": (all(contiguous.values()) if contiguous else None),
        "failed": envelope.get("failed") or [],
    }
    _prune(_METRICS_CACHE, _METRICS_CACHE_TTL)
    _METRICS_CACHE[public_id] = (time.monotonic(), row)
    return JsonResponse(row)


def _next_url(request):
    next_url = request.POST.get("next")
    if next_url and url_has_allowed_host_and_scheme(
        next_url, allowed_hosts={request.get_host()}
    ):
        return next_url
    return reverse("portals_index")


@group_required(PORTAL_EDITOR_GROUPS)
def submission_action(request):
    """Apply a takedown action to one submission.

    action: nsfw (blur/unblur) or hidden (takedown/restore); value: 1|0.
    Both resolve the visitor's flag report on the backend.
    """
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    action = request.POST.get("action", "")
    value = request.POST.get("value", "")
    if action not in SUBMISSION_ACTIONS or value not in ("0", "1"):
        return HttpResponseBadRequest("Invalid submission action")

    try:
        submission_id = int(request.POST["id"])
    except (KeyError, ValueError):
        return HttpResponseBadRequest("Invalid submission action")

    setter = (
        services.set_submission_nsfw
        if action == "nsfw"
        else services.set_submission_hidden
    )
    try:
        setter(request.user, submission_id, value == "1")
    except (BackendAPIError, RequestException) as exc:
        logger.exception("Submission update failed")
        messages.error(request, f"Update failed: {exc}")
    else:
        described = {
            ("nsfw", "1"): "marked sensitive (blurred)",
            ("nsfw", "0"): "unblurred",
            ("hidden", "1"): "hidden from the public site",
            ("hidden", "0"): "restored",
        }[(action, value)]
        messages.success(request, f"Submission #{submission_id} {described}.")

    return redirect(_next_url(request))


def _default_gallery_block(public_id):
    """A fresh plan_gallery block for a portal that has none yet, matching
    PlanGalleryBlock's schema/defaults (content/blocks.py)."""
    return {
        "type": "plan_gallery",
        "value": {
            "ids": [public_id],
            "tags": [],
            "title": "Community submissions",
            "description": "",
            "paginate": True,
            "showListView": True,
            "showThumbnails": True,
            "showTitles": True,
            "showDescriptions": True,
            "showUpdatedAt": True,
            "showTags": True,
            "showModule": True,
            "limit": 12,
        },
    }


@group_required(PORTAL_EDITOR_GROUPS)
def add_to_portal_gallery(request):
    """Append a submitted plan to the portal page's own CURATED gallery block.

    Optional curation, not review: the gallery lives IN the portal page (the
    plan_gallery block's ids), so this mutates the page's latest revision as
    a draft — publishing still goes through the page's normal approval
    workflow (pages keep review; submissions don't).
    """
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    try:
        portal_slug = request.POST["portal"]
        public_id = int(request.POST["public_id"])
    except (KeyError, ValueError):
        return HttpResponseBadRequest("Invalid gallery submission")

    portal, denied = _get_portal_or_denied(request, portal_slug)
    if denied:
        return denied

    page = portal.get_latest_revision_as_object()
    body_data = page.body.get_prep_value()
    gallery_blocks = [b for b in body_data if b.get("type") == "plan_gallery"]
    if gallery_blocks:
        ids = list(gallery_blocks[0]["value"].get("ids") or [])
        if public_id in ids:
            messages.warning(
                request,
                f"Plan {public_id} is already in this portal's curated gallery.",
            )
            return redirect(_next_url(request))
        gallery_blocks[0]["value"]["ids"] = [*ids, public_id]
    else:
        body_data.append(_default_gallery_block(public_id))
    page.body = page.body.stream_block.to_python(body_data)
    page.save_revision(user=request.user)
    messages.success(
        request,
        f"Plan {public_id} added to the portal page's curated gallery as a "
        "draft — publish the page to make it public.",
    )
    return redirect(_next_url(request))
