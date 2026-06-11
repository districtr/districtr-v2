"""
Team-based scoping for content pages (TagPage, PlacePage) in the Wagtail page
explorer.

A team-scoped member sees and edits only the content pages tied to a Districtr
map their teams own (TagPage.districtr_map_slug / any of
PlacePage.districtr_map_slugs -> DistrictrMap -> DistrictrMapsToGroups ->
MapGroup). Admins, superusers, and team-less users are unaffected. Structural
pages (index/home) carry no map association and are left to Wagtail's normal,
tree-based page permissions.

Pages use tree-based GroupPagePermission rather than per-object querysets, so
this overlays two hooks:
- construct_explorer_page_queryset hides out-of-scope content pages from the
  explorer listing;
- before_edit_page / before_delete_page hard-block direct-URL access, since the
  explorer filter alone would not stop a guessed page id.

Creation is constrained instead by the team-aware page forms (content/forms.py),
which only offer a member their own teams' map slugs.
"""

from wagtail import hooks
from wagtail.admin.auth import permission_denied

from authapi.teams import districtr_map_slugs_for_user, user_is_team_scoped
from content.models import PlacePage, TagPage


def _is_out_of_scope_page(request, page):
    """True when a team-scoped user is acting on a content page outside their
    groups. Non-content pages return False — they are not team-scoped here."""
    if not user_is_team_scoped(request.user):
        return False
    specific = page.specific
    scoped = districtr_map_slugs_for_user(request.user)
    if isinstance(specific, TagPage):
        return specific.districtr_map_slug not in scoped
    if isinstance(specific, PlacePage):
        # In scope when the page features at least one map the team owns.
        return scoped.isdisjoint(specific.districtr_map_slugs)
    return False


@hooks.register("construct_explorer_page_queryset")
def scope_content_pages_in_explorer(parent_page, pages, request):
    if not user_is_team_scoped(request.user):
        return pages
    scoped = list(districtr_map_slugs_for_user(request.user))
    out_of_scope = TagPage.objects.exclude(
        districtr_map_slug__in=scoped
    ).values_list("pk", flat=True)
    out_of_scope_places = PlacePage.objects.exclude(
        districtr_map_slugs__overlap=scoped
    ).values_list("pk", flat=True)
    return pages.exclude(pk__in=out_of_scope).exclude(pk__in=out_of_scope_places)


@hooks.register("before_edit_page")
def deny_out_of_team_page_edit(request, page):
    if _is_out_of_scope_page(request, page):
        return permission_denied(request)


@hooks.register("before_delete_page")
def deny_out_of_team_page_delete(request, page):
    if _is_out_of_scope_page(request, page):
        return permission_denied(request)
