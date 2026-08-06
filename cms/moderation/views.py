"""
Comment moderation and site-settings views inside the Wagtail admin.

Thin HTML over the FastAPI backend's moderation endpoints (moderation/
services.py): listing, filtering, and review actions all round-trip through
the backend with a token minted for the acting user, so scope and tag-scope
enforcement stays there. Registered under /admin/ via register_admin_urls
(moderation/wagtail_hooks.py), so Wagtail's require_admin_access gates
anonymous users; the group gates below only control access to the pages —
the backend re-checks everything.
"""

import logging

from django.http import HttpResponseBadRequest, HttpResponseNotAllowed
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils.http import url_has_allowed_host_and_scheme
from requests import RequestException
from wagtail.admin import messages
from wagtail.admin.auth import permission_denied, user_passes_test

from authapi.teams import (
    districtr_map_slugs_for_user,
    instance_in_scope,
    team_ids_for_user,
    user_is_team_scoped,
)
from galleries.models import Gallery, GalleryEntry
from moderation import services
from moderation.forms import CommentFilterForm
from moderation.services import BackendAPIError

logger = logging.getLogger(__name__)

# Group gates matching the FastAPI scopes the pages need (authapi/scopes.py):
# create:content_review for the review queues, update:update-all (admin only)
# for site settings.
COMMENT_REVIEW_GROUPS = frozenset({"admin", "partner", "super_partner"})
SITE_SETTINGS_GROUPS = frozenset({"admin"})

PAGE_SIZE = 20

REVIEW_STATUSES = {"APPROVED", "REJECTED", "REVIEWED"}
SINGLE_CONTENT_TYPES = {"comment", "commenter", "tag"}


def group_required(groups):
    """Allow superusers and members of `groups`; else Wagtail's standard
    permission-denied response (redirect to admin home with an error)."""
    return user_passes_test(
        lambda user: user.is_superuser or user.groups.filter(name__in=groups).exists()
    )


def _prep_entry(entry: dict) -> dict:
    """Reshape an AdminCommentResponse dict for the template: zip the
    parallel tags/tag_ids/tag_review_status arrays into rows, and precompute
    the CSV of tag ids the fan-out actions post."""
    tags = entry.get("tags") or []
    ids = entry.get("tag_ids") or []
    statuses = entry.get("tag_review_status") or []
    entry["tag_rows"] = [
        {"slug": slug, "id": tag_id, "status": status}
        for slug, tag_id, status in zip(tags, ids, statuses)
        if tag_id is not None
    ]
    entry["tag_ids_csv"] = ",".join(str(i) for i in ids if i is not None)
    return entry


def _list_view(request, form, fetch, template, title, extra_context=None):
    try:
        page = max(int(request.GET.get("p", 1)), 1)
    except ValueError:
        page = 1

    entries, has_next, error = [], False, None
    if form.is_valid():
        params = form.backend_params()
        params["offset"] = (page - 1) * PAGE_SIZE
        # The backend returns a bare list with no total count: fetch one row
        # beyond the page to know whether a next page exists.
        params["limit"] = PAGE_SIZE + 1
        try:
            entries = fetch(request.user, **params)
        except (BackendAPIError, RequestException) as exc:
            logger.exception("Moderation list fetch failed")
            error = str(exc)
        has_next = len(entries) > PAGE_SIZE
        entries = [_prep_entry(e) for e in entries[:PAGE_SIZE]]

    querystring = request.GET.copy()
    querystring.pop("p", None)
    return render(
        request,
        template,
        {
            "form": form,
            "entries": entries,
            "error": error,
            "page": page,
            "prev_page": page - 1,
            "next_page": page + 1,
            "has_next": has_next,
            "base_qs": querystring.urlencode(),
            "title": title,
            # A tag-scoped reviewer (ReviewTagAssignment rows) may only act on
            # tags: the backend 403s whole-entry/commenter actions and the
            # untagged district-comment queue by design, so the templates hide
            # those controls instead of offering doomed buttons.
            "tag_scoped": request.user.review_tag_assignments.exists(),
            **(extra_context or {}),
        },
    )


def _galleries_for_user(user):
    """Galleries the user may curate submissions into: change_gallery
    holders, narrowed to their own teams' galleries when team-scoped."""
    if not user.has_perm("galleries.change_gallery"):
        return Gallery.objects.none()
    queryset = Gallery.objects.all()
    if user_is_team_scoped(user):
        queryset = queryset.filter(team_id__in=team_ids_for_user(user))
    return queryset.order_by("title")


def _accessible_portals(user):
    """TagPages whose submissions the user may review: all portals for admins
    and unscoped reviewers, the team's portals for team-scoped members,
    further narrowed by ReviewTagAssignment rows (a portal's page slug is its
    comment tag slug)."""
    from wagtail.models import Locale

    from content.models import TagPage

    portals = TagPage.objects.filter(locale=Locale.get_default()).order_by("title")
    if user_is_team_scoped(user):
        portals = portals.filter(
            districtr_map_slug__in=districtr_map_slugs_for_user(user)
        )
    assigned = set(user.review_tag_assignments.values_list("tag_slug", flat=True))
    if assigned:
        portals = portals.filter(slug__in=assigned)
    return portals


@group_required(COMMENT_REVIEW_GROUPS)
def review_portals(request):
    """Entry point of the review flow: pick one of your portals."""
    return render(
        request,
        "moderation/portals.html",
        {"portals": _accessible_portals(request.user)},
    )


@group_required(COMMENT_REVIEW_GROUPS)
def portal_review(request, slug):
    """One portal's submission queue: comments or map submissions (comments
    arriving with an attached plan), switched by ?kind=. The portal supplies
    the tag filter; approving a plan into a gallery goes through
    add_to_gallery below."""
    portal = _accessible_portals(request.user).filter(slug=slug).first()
    if portal is None:
        return permission_denied(request)
    kind = request.GET.get("kind", "comments")
    if kind not in ("comments", "maps"):
        kind = "comments"

    form = CommentFilterForm(request.GET or {})
    form.fields.pop("tags")  # the portal IS the tag filter

    def fetch(user, **params):
        params["tags"] = [portal.slug]
        if kind == "maps":
            params["has_document"] = "true"
        return services.list_form_comments(user, **params)

    extra = {"portal": portal, "kind": kind}
    if kind == "maps":
        extra["galleries"] = _galleries_for_user(request.user)
    return _list_view(
        request,
        form,
        fetch,
        "moderation/portal_review.html",
        f"Review: {portal.title}",
        extra_context=extra,
    )


@group_required(COMMENT_REVIEW_GROUPS)
def add_to_gallery(request):
    """Append a submitted plan to a gallery as a DRAFT revision.

    Gallery entries live in revision content (DraftState + RevisionMixin), so
    this mirrors the edit view — modify the latest-revision object and
    save_revision — rather than inserting a live GalleryEntry row that the
    next publish would clobber. Publishing stays with admins (or a workflow).
    """
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    if not request.user.has_perm("galleries.change_gallery"):
        return permission_denied(request)
    try:
        gallery_id = int(request.POST["gallery"])
        public_id = int(request.POST["public_id"])
    except (KeyError, ValueError):
        return HttpResponseBadRequest("Invalid gallery submission")

    gallery = Gallery.objects.filter(pk=gallery_id).first()
    if gallery is None or not instance_in_scope(
        request.user, Gallery, "team_id", gallery.pk
    ):
        return permission_denied(request)

    latest = gallery.get_latest_revision_as_object()
    if any(e.document_public_id == public_id for e in latest.entries.all()):
        messages.warning(request, f"Plan {public_id} is already in “{gallery.title}”.")
    else:
        latest.entries.add(GalleryEntry(document_public_id=public_id))
        latest.save_revision(user=request.user)
        messages.success(
            request,
            f"Plan {public_id} added to “{gallery.title}” as a draft — "
            "publish the gallery to make it public.",
        )

    next_url = request.POST.get("next")
    if next_url and url_has_allowed_host_and_scheme(
        next_url, allowed_hosts={request.get_host()}
    ):
        return redirect(next_url)
    return redirect(reverse("moderation_review_portals"))


def _int_list(csv: str) -> list[int]:
    return [int(v) for v in csv.split(",") if v.strip()]


@group_required(COMMENT_REVIEW_GROUPS)
def review_action(request):
    """Apply a review status at one of five granularities.

    content_type: comment | commenter | tag (single `id`), tags (`ids` CSV
    fan-out), entry (`comment_id` + optional `commenter_id` + `tag_ids` CSV) —
    mirroring the legacy EntryRow actions. Fan-outs are sequential backend
    calls, same as the old client behavior; fine at moderation volumes.
    """
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    content_type = request.POST.get("content_type", "")
    review_status = request.POST.get("review_status", "")
    if review_status not in REVIEW_STATUSES or content_type not in (
        SINGLE_CONTENT_TYPES | {"tags", "entry"}
    ):
        return HttpResponseBadRequest("Invalid review action")

    try:
        if content_type in SINGLE_CONTENT_TYPES:
            services.review_item(
                request.user, content_type, int(request.POST["id"]), review_status
            )
        elif content_type == "tags":
            for tag_id in _int_list(request.POST.get("ids", "")):
                services.review_item(request.user, "tag", tag_id, review_status)
        else:  # entry: whole-row fan-out
            services.review_item(
                request.user, "comment", int(request.POST["comment_id"]), review_status
            )
            if request.POST.get("commenter_id"):
                services.review_item(
                    request.user,
                    "commenter",
                    int(request.POST["commenter_id"]),
                    review_status,
                )
            for tag_id in _int_list(request.POST.get("tag_ids", "")):
                services.review_item(request.user, "tag", tag_id, review_status)
    except (KeyError, ValueError):
        return HttpResponseBadRequest("Invalid review action")
    except (BackendAPIError, RequestException) as exc:
        logger.exception("Review update failed")
        messages.error(request, f"Review update failed: {exc}")
    else:
        messages.success(request, f"Marked {content_type} as {review_status}.")

    next_url = request.POST.get("next")
    if next_url and url_has_allowed_host_and_scheme(
        next_url, allowed_hosts={request.get_host()}
    ):
        return redirect(next_url)
    return redirect(reverse("moderation_review_portals"))


@group_required(SITE_SETTINGS_GROUPS)
def site_settings(request):
    if request.method == "POST":
        try:
            services.update_site_settings(
                request.user, "under_construction" in request.POST
            )
        except (BackendAPIError, RequestException) as exc:
            logger.exception("Site settings update failed")
            messages.error(request, f"Saving failed: {exc}")
        else:
            messages.success(
                request,
                "Site settings saved. The frontend picks the change up "
                "within about a minute.",
            )
        return redirect("moderation_site_settings")

    under_construction, error = False, None
    try:
        under_construction = services.get_site_settings().get("under_construction")
    except (BackendAPIError, RequestException) as exc:
        logger.exception("Site settings fetch failed")
        error = str(exc)
    return render(
        request,
        "moderation/site_settings.html",
        {"under_construction": under_construction, "error": error},
    )
