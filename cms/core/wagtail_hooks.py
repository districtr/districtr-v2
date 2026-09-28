"""
Site-wide Wagtail admin customisations:

- a role-aware "Districtr shortcuts" dashboard panel (construct_homepage_panels)
  rendered as action cards whose labels match the sidebar actions exactly
  (Site content, Review, Map modules, admin screens);
- main-menu trimming (construct_main_menu): Reports, the raw Pages tree and
  the generic Snippets listing are hidden for non-admins (the Portals hub
  covers portal pages and forms); Reports is relabelled "Admin analytics"
  for admins. The dashboard's "n Pages" summary link into that same tree is
  dropped for non-admins too (construct_homepage_summary_items). Images/Documents stay for everyone
  because RICH_TEXT_FEATURES (content/blocks.py) includes image, embed, and
  document-link;
- Districtr branding CSS (insert_global_admin_css, core/static/core/admin.css).

The stock homepage panels (workflow moderation, recent edits, locked pages)
are deliberately left in place: they all self-hide when empty, and the
workflow panels are how page-approval work surfaces. The upgrade nag is
already disabled via WAGTAIL_ENABLE_UPDATE_CHECK.
"""

from django.templatetags.static import static
from django.urls import reverse
from django.utils.html import format_html
from wagtail import hooks
from wagtail.admin.site_summary import PagesSummaryItem
from wagtail.admin.ui.components import Component

from core.menu import in_groups

SHORTCUT_GROUPS = ("partner", "super_partner", "admin")


def _is_admin(user):
    return in_groups(user, ("admin",))


def _in_shortcut_groups(user):
    return in_groups(user, SHORTCUT_GROUPS)


def _index_explorer_url(index_model):
    """Explorer listing of a content index (provisioned by content/0002_provision_site)."""
    from wagtail.models import Locale

    index = (
        index_model.objects.filter(locale=Locale.get_default()).first()
        or index_model.objects.first()
    )
    return reverse("wagtailadmin_explore", args=[index.pk]) if index else None


class DistrictrShortcutsPanel(Component):
    """Action cards mirroring the sidebar's action labels, one card each."""

    name = "districtr_shortcuts"
    order = 50  # above every stock panel (110+)
    template_name = "core/home/districtr_shortcuts.html"

    def __init__(self, request):
        self.request = request

    def get_context_data(self, parent_context):
        from content.models import PlacesIndexPage, StaticIndexPage

        user = self.request.user
        cards = []

        if _in_shortcut_groups(user):
            cards.append(
                {"label": "Portals", "url": reverse("portals_index"), "icon": "tag"}
            )
            cards.append(
                {
                    "label": "New portal",
                    "url": reverse("content_portal_wizard"),
                    "icon": "plus",
                }
            )

        # The map-module tools ride on their server-side permission gates
        # (datastore/views.py): admin + super_partner.
        if user.has_perm("datastore.add_districtrmap"):
            cards.append(
                {
                    "label": "Create map module",
                    "url": reverse("datastore_compose_map"),
                    "icon": "plus",
                }
            )
            cards.append(
                {
                    "label": "Edit map modules",
                    "url": reverse("wagtailsnippets_datastore_districtrmap:list"),
                    "icon": "globe",
                }
            )
        if user.has_perm("datastore.add_overlay"):
            cards.append(
                {
                    "label": "Edit overlays",
                    "url": reverse("wagtailsnippets_datastore_overlay:list"),
                    "icon": "sliders",
                }
            )
            cards.append(
                {
                    "label": "Upload overlay",
                    "url": reverse("datastore_upload_overlay"),
                    "icon": "upload",
                }
            )

        if _is_admin(user):
            for label, model, icon in (
                ("Edit place pages", PlacesIndexPage, "site"),
                ("Edit static pages", StaticIndexPage, "doc-full"),
            ):
                url = _index_explorer_url(model)
                if url:
                    cards.append({"label": label, "url": url, "icon": icon})
            cards.append(
                {
                    "label": "Teams",
                    "url": reverse("wagtailsnippets_authapi_team:list"),
                    "icon": "group",
                }
            )
            cards.append(
                {
                    "label": "Frontend settings",
                    "url": reverse("moderation_site_settings"),
                    "icon": "cog",
                }
            )

        return {"cards": cards}


@hooks.register("construct_homepage_panels")
def add_districtr_shortcuts_panel(request, panels):
    panels.insert(0, DistrictrShortcutsPanel(request))


@hooks.register("construct_main_menu")
def trim_main_menu(request, menu_items):
    # Reports (locked pages, workflows, site history …) is admin housekeeping;
    # partners and super partners never need it. For admins it reads better
    # as "Admin analytics".
    if not _is_admin(request.user):
        # The Portals hub covers portal pages and their forms ("Edit page",
        # "Edit form" per row); the raw Pages tree and the generic Snippets
        # listing (which holds only Portal forms for partners) stay
        # admin-only. Map modules and Teams have their own named menus.
        menu_items[:] = [
            item
            for item in menu_items
            if item.name not in ("reports", "explorer", "snippets")
        ]
    else:
        for item in menu_items:
            if item.name == "reports":
                item.label = "Admin analytics"


@hooks.register("construct_homepage_summary_items")
def trim_homepage_summary(request, summary_items):
    # The stock "n Pages" item links into the explorer the sidebar hides.
    if not _is_admin(request.user):
        summary_items[:] = [
            item for item in summary_items if not isinstance(item, PagesSummaryItem)
        ]


@hooks.register("insert_global_admin_css")
def districtr_admin_css():
    return format_html('<link rel="stylesheet" href="{}">', static("core/admin.css"))
