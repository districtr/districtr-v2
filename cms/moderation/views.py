"""
Submission moderation and site-settings views inside the Wagtail admin.

Thin HTML over the FastAPI backend's moderation endpoints (moderation/
services.py): listing, filtering, and the two reviewer actions (nsfw
blur/unblur, hide/restore) all round-trip through the backend with a token
minted for the acting user, so scope and teams x admin_teams enforcement
stays there. There is no approval gate: submissions are public on arrival,
moderation only blurs (nsfw) or removes (hidden). Registered under /admin/
via register_admin_urls (moderation/wagtail_hooks.py), so Wagtail's
require_admin_access gates anonymous users; the group gates below only
control access to the pages — the backend re-checks everything.
"""

import logging

from django.http import HttpResponseBadRequest, HttpResponseNotAllowed
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils.http import url_has_allowed_host_and_scheme
from requests import RequestException
from wagtail.admin import messages
from wagtail.admin.auth import permission_denied, user_passes_test

from authapi.teams import team_slugs_for_user, user_is_unscoped_admin
from moderation import services
from moderation.forms import SubmissionFilterForm
from moderation.services import BackendAPIError

logger = logging.getLogger(__name__)

# Group gates matching the FastAPI scopes the pages need (authapi/scopes.py):
# create:content_review for the review queues, update:update-all (admin only)
# for site settings.
COMMENT_REVIEW_GROUPS = frozenset({"admin", "partner", "super_partner"})
SITE_SETTINGS_GROUPS = frozenset({"admin"})

PAGE_SIZE = 20

# The two reviewer actions; anything else in a POST is rejected.
SUBMISSION_ACTIONS = {"nsfw", "hidden"}


def group_required(groups):
    """Allow superusers and members of `groups`; else Wagtail's standard
    permission-denied response (redirect to admin home with an error)."""
    return user_passes_test(
        lambda user: user.is_superuser or user.groups.filter(name__in=groups).exists()
    )


def _prep_entry(entry: dict) -> dict:
    """Reshape a SubmissionAdmin dict for the template: pull the headline
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
            **(extra_context or {}),
        },
    )


def _accessible_portals(user):
    """TagPages whose submissions the user may moderate: all portals for
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
    """One portal's submission queue: written submissions or map submissions
    (those arriving with an attached plan), switched by ?kind=. Adding an
    approved plan to a gallery goes through add_to_gallery below."""
    portal = _accessible_portals(request.user).filter(slug=slug).first()
    if portal is None:
        return permission_denied(request)
    kind = request.GET.get("kind", "comments")
    if kind not in ("comments", "maps"):
        kind = "comments"

    form = SubmissionFilterForm(request.GET or {})

    def fetch(user, **params):
        params["portal_id"] = portal.slug
        if kind == "maps":
            params["has_map"] = "true"
        return services.list_submissions(user, **params)

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
    """Append a submitted plan to the portal page's own gallery block.

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
    # Deliberate: moderation reach (admin_teams), not Wagtail page-edit
    # permission, authorizes this write — curating the portal gallery is the
    # moderator's job even on pages they don't own, the write is a DRAFT
    # revision, and publishing still goes through page approval.

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
def submission_action(request):
    """Apply a reviewer action to one submission.

    action: nsfw (blur/unblur) or hidden (takedown/restore); value: 1|0.
    Both resolve the user's flag report on the backend.
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
