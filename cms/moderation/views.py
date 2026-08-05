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
from wagtail.admin.auth import user_passes_test

from moderation import services
from moderation.forms import CommentFilterForm, DistrictCommentFilterForm
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


def _list_view(request, form, fetch, template, title):
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
        },
    )


@group_required(COMMENT_REVIEW_GROUPS)
def comments(request):
    form = CommentFilterForm(request.GET or {})
    return _list_view(
        request,
        form,
        services.list_form_comments,
        "moderation/comments.html",
        "Comment review",
    )


@group_required(COMMENT_REVIEW_GROUPS)
def district_comments(request):
    # First render defaults to the flagged queue, matching the legacy UI.
    form = DistrictCommentFilterForm(request.GET or {"flagged": "1"})
    return _list_view(
        request,
        form,
        services.list_district_comments,
        "moderation/district_comments.html",
        "District comment review",
    )


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
    return redirect(reverse("moderation_comments"))


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
