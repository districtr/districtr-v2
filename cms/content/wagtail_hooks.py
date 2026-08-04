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
this overlays hooks:
- construct_explorer_page_queryset hides out-of-scope content pages from the
  explorer listing;
- before_{edit,delete,unpublish,copy,move}_page and before_bulk_action
  hard-block every direct-URL mutation path, since the explorer filter alone
  would not stop a guessed page id.

Creation is constrained instead by the team-aware page forms (content/forms.py),
which only offer a member their own teams' map slugs.

Known ceiling: /admin/pages/search/ runs no queryset hook, so a team-scoped
member can still SEE out-of-scope page titles there — but every action on them
is blocked by the hooks above. Blocking the listing itself would mean replacing
Wagtail's search view; not worth it for a read-only title list.
"""

from wagtail import hooks
from wagtail.admin.auth import permission_denied
from wagtail.models import Page

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
    out_of_scope = TagPage.objects.exclude(districtr_map_slug__in=scoped).values_list(
        "pk", flat=True
    )
    out_of_scope_places = PlacePage.objects.exclude(
        districtr_map_slugs__overlap=scoped
    ).values_list("pk", flat=True)
    return pages.exclude(pk__in=out_of_scope).exclude(pk__in=out_of_scope_places)


@hooks.register("before_edit_page")
@hooks.register("before_delete_page")
@hooks.register("before_unpublish_page")
@hooks.register("before_copy_page")
def deny_out_of_team_page_action(request, page):
    if _is_out_of_scope_page(request, page):
        return permission_denied(request)


@hooks.register("before_move_page")
def deny_out_of_team_page_move(request, page, destination):
    if _is_out_of_scope_page(request, page):
        return permission_denied(request)


@hooks.register("before_bulk_action")
def deny_out_of_team_bulk_action(request, action_type, objects, action):
    # Page bulk actions (delete/publish/unpublish/move) fire only this hook,
    # never the per-page ones. Fires for snippet bulk actions too, so guard on
    # Page — snippets are covered by their own hooks.
    if any(
        isinstance(obj, Page) and _is_out_of_scope_page(request, obj) for obj in objects
    ):
        return permission_denied(request)
