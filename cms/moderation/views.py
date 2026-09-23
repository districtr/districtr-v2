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
    user_is_team_scoped,
)
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
REVIEWABLE_CONTENT_TYPES = {"comment", "commenter"}


def group_required(groups):
    """Allow superusers and members of `groups`; else Wagtail's standard
    permission-denied response (redirect to admin home with an error)."""
    return user_passes_test(
        lambda user: user.is_superuser or user.groups.filter(name__in=groups).exists()
    )


def _prep_entry(entry: dict) -> dict:
    """Reshape an AdminCommentResponse dict for the template: zip the parallel
    tags/tag_review_status arrays into display rows. The backend aggregates
    them in one shared order (build_tag_subquery), which is what makes the zip
    correct. Tags are display-only here — their review status is global."""
    tags = entry.get("tags") or []
    statuses = entry.get("tag_review_status") or []
    entry["tag_rows"] = [
        {"slug": slug, "status": status} for slug, status in zip(tags, statuses)
    ]
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
            # Team-scoped reviewers carry a portal-derived review_tags claim:
            # the backend 403s whole-entry/commenter actions for them by
            # design, so the templates hide those controls instead of
            # offering doomed buttons. Admins stay unrestricted.
            "tag_scoped": user_is_team_scoped(request.user),
            **(extra_context or {}),
        },
    )


def _accessible_portals(user):
    """TagPages whose submissions the user may review: all portals for admins
    and unscoped reviewers, the team's portals for team-scoped members (a
    portal's page slug is its comment tag slug — the same rule the JWT
    review_tags claim is minted from)."""
    from wagtail.models import Locale

    from content.models import TagPage

    portals = TagPage.objects.filter(locale=Locale.get_default()).order_by("title")
    if user_is_team_scoped(user):
        portals = portals.filter(
            districtr_map_slug__in=districtr_map_slugs_for_user(user)
        )
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
    return _list_view(
        request,
        form,
        fetch,
        "moderation/portal_review.html",
        f"Review: {portal.title}",
        extra_context=extra,
    )


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


@group_required(COMMENT_REVIEW_GROUPS)
def add_to_portal_gallery(request):
    """Append an approved plan to the portal page's own gallery block.

    The gallery lives IN the portal page (the plan_gallery block's curated
    ids), so this mutates the page's latest revision as a draft: appends the
    id to the first plan_gallery block (creating one at the end of the body
    when the page has none). Publishing still goes through the page's
    normal admin-approval workflow.
    """
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    try:
        portal_slug = request.POST["portal"]
        public_id = int(request.POST["public_id"])
    except (KeyError, ValueError):
        return HttpResponseBadRequest("Invalid gallery submission")

    portal = _accessible_portals(request.user).filter(slug=portal_slug).first()
    if portal is None:
        return permission_denied(request)

    page = portal.get_latest_revision_as_object()
    body_data = page.body.get_prep_value()
    gallery_blocks = [b for b in body_data if b.get("type") == "plan_gallery"]
    if gallery_blocks:
        ids = list(gallery_blocks[0]["value"].get("ids") or [])
        if public_id in ids:
            messages.warning(
                request,
                f"Plan {public_id} is already in this portal's gallery.",
            )
            return redirect(_next_url(request))
        gallery_blocks[0]["value"]["ids"] = [*ids, public_id]
    else:
        body_data.append(_default_gallery_block(public_id))
    page.body = page.body.stream_block.to_python(body_data)
    page.save_revision(user=request.user)
    messages.success(
        request,
        f"Plan {public_id} added to the portal page's gallery as a draft — "
        "publish the page (via moderation) to make it public.",
    )
    return redirect(_next_url(request))


def _next_url(request):
    next_url = request.POST.get("next")
    if next_url and url_has_allowed_host_and_scheme(
        next_url, allowed_hosts={request.get_host()}
    ):
        return next_url
    return reverse("moderation_review_portals")


@group_required(COMMENT_REVIEW_GROUPS)
def review_action(request):
    """Apply a review status to a comment, a commenter, or both.

    content_type: comment | commenter (single `id`), or entry (`comment_id`
    plus optional `commenter_id`). Tags are deliberately NOT reviewable here:
    Tag.review_status is global (rejecting one hides every comment carrying
    that tag, site-wide), so it must not be a per-submission action.
    """
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    content_type = request.POST.get("content_type", "")
    review_status = request.POST.get("review_status", "")
    if review_status not in REVIEW_STATUSES or content_type not in (
        REVIEWABLE_CONTENT_TYPES | {"entry"}
    ):
        return HttpResponseBadRequest("Invalid review action")

    try:
        if content_type in REVIEWABLE_CONTENT_TYPES:
            services.review_item(
                request.user, content_type, int(request.POST["id"]), review_status
            )
        else:  # entry: the comment, plus its commenter when there is one
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
    except (KeyError, ValueError):
        return HttpResponseBadRequest("Invalid review action")
    except (BackendAPIError, RequestException) as exc:
        logger.exception("Review update failed")
        messages.error(request, f"Review update failed: {exc}")
    else:
        messages.success(request, f"Marked {content_type} as {review_status}.")

    return redirect(_next_url(request))


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
