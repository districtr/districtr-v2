"""
Team-based scoping for content pages (PortalPage, PlacePage) in the Wagtail page
explorer.

A team-scoped member sees and edits only the content pages their teams own:
a PortalPage (portal) when its FormConfig.admin_teams names one of their teams
(authapi.teams.portal_slugs_for_user — the same key the Portals hub and the
backend's moderation checks use), a PlacePage when any of its
districtr_map_slugs is a module their teams hold. Structural pages
(index/home) carry no team association and are left to Wagtail's normal,
tree-based page permissions.

The main enforcement point is the page permission tester
(content/permissions.py), which every Wagtail and wagtail-localize view
consults. These hooks add defense in depth on the mutation paths and hide
out-of-scope pages from the explorer; all of them share
content.scoping.page_out_of_scope. Creation is constrained by the team-aware
page forms (content/forms.py).

Known ceiling: /admin/pages/search/ runs no queryset hook, so a team-scoped
member can still SEE out-of-scope page titles there — every action on them is
blocked by the hooks above.
"""

from django.urls import reverse
from wagtail import hooks
from wagtail.admin.auth import permission_denied
from wagtail.admin.menu import Menu, SubmenuMenuItem
from wagtail.models import Locale, Page

from core.menu import GroupMenuItem

from authapi.teams import districtr_map_slugs_for_user, user_is_team_scoped
from content.scoping import in_scope_portal_translation_keys, page_out_of_scope
from content.models import (
    PlacePage,
    PlacesIndexPage,
    StaticIndexPage,
    PortalPage,
)


def _is_out_of_scope_page(request, page):
    return page_out_of_scope(request.user, page)


@hooks.register("construct_explorer_page_queryset")
def scope_content_pages_in_explorer(parent_page, pages, request):
    if not user_is_team_scoped(request.user):
        return pages
    # By translation_key, so every locale of an in-scope portal stays listed
    # and no locale of another team's portal slips in under a stale slug.
    out_of_scope = PortalPage.objects.exclude(
        translation_key__in=in_scope_portal_translation_keys(request.user)
    ).values_list("pk", flat=True)
    out_of_scope_places = PlacePage.objects.exclude(
        districtr_map_slugs__overlap=list(districtr_map_slugs_for_user(request.user))
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


# ---------------------------------------------------------------------------
# "Site content" menu: direct entry points into each content index's listing
# (the raw Pages tree buries them — "how do I edit /place/colorado?").
# ---------------------------------------------------------------------------

ADMIN_ONLY_GROUPS = frozenset({"admin"})


class ContentIndexMenuItem(GroupMenuItem):
    """Explorer listing of a content index, gated by group.

    The index page pk is resolved lazily (indexes exist after
    content/0002_provision_site; Wagtail builds registered menu items on
    first render, when the DB is available). Falls back to the pages root
    if the index is missing.
    """

    def __init__(self, label, index_model, *, groups, **kwargs):
        self.index_model = index_model
        super().__init__(label, url="", groups=groups, **kwargs)

    def is_shown(self, request):
        # Resolve the URL here — per-request, after migrations, never at
        # import time.
        index = (
            self.index_model.objects.filter(locale=Locale.get_default()).first()
            or self.index_model.objects.first()
        )
        self.url = (
            reverse("wagtailadmin_explore", args=[index.pk])
            if index
            else reverse("wagtailadmin_explore_root")
        )
        return super().is_shown(request)


@hooks.register("register_admin_menu_item")
def register_site_content_menu_item():
    # Places and static pages only — portals moved to the Portals hub
    # (portals/wagtail_hooks.py). SubmenuMenuItem self-hides when no child
    # is shown.
    return SubmenuMenuItem(
        "Site content",
        Menu(
            items=[
                ContentIndexMenuItem(
                    "Edit place pages",
                    PlacesIndexPage,
                    groups=ADMIN_ONLY_GROUPS,
                    icon_name="site",
                    order=2,
                ),
                ContentIndexMenuItem(
                    "Edit static pages",
                    StaticIndexPage,
                    groups=ADMIN_ONLY_GROUPS,
                    icon_name="doc-full",
                    order=3,
                ),
            ]
        ),
        icon_name="doc-full-inverse",
        order=110,
    )
