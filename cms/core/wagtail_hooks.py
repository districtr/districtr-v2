"""
Site-wide Wagtail admin customisations:

- a role-aware "Districtr shortcuts" dashboard panel (construct_homepage_panels)
  surfacing each role's day-to-day pages — partners get review queues, portal
  page creation, and their teams' galleries/map modules; super partners add the
  data tools; admins add the admin-only screens;
- main-menu trimming (construct_main_menu): Reports is hidden for
  non-admins and relabelled "Admin analytics" for admins.
  Images/Documents stay for everyone because RICH_TEXT_FEATURES
  (content/blocks.py) includes image, embed, and document-link;
- Districtr branding CSS (insert_global_admin_css, core/static/core/admin.css).

The stock homepage panels (workflow moderation, recent edits, locked pages)
are deliberately left in place: they all self-hide when empty, and the
workflow panels are how page-approval work surfaces. The upgrade nag is
already disabled via WAGTAIL_ENABLE_UPDATE_CHECK.
"""

from django.db import ProgrammingError, transaction
from django.templatetags.static import static
from django.urls import reverse
from django.utils.html import format_html
from wagtail import hooks
from wagtail.admin.ui.components import Component

from authapi.teams import scoped_queryset, team_ids_for_user, user_is_team_scoped

# Cap the per-team listings so a many-team user cannot blow up the dashboard.
MAX_LISTED = 20

SHORTCUT_GROUPS = ("partner", "super_partner", "admin")


def _is_admin(user):
    return user.is_superuser or user.groups.filter(name="admin").exists()


def _in_shortcut_groups(user):
    return user.is_superuser or user.groups.filter(name__in=SHORTCUT_GROUPS).exists()


def _add_portal_page_url():
    """The TagPage add URL under the tags index, or None before bootstrap."""
    from content.models import TagsIndexPage

    tags_index = TagsIndexPage.objects.first()
    if tags_index is None:
        return None
    return reverse("wagtailadmin_pages:add", args=("content", "tagpage", tags_index.pk))


def _gallery_items(user):
    """The galleries the user curates: their teams' when team-scoped, else a
    single link to the listing (admins and unscoped partners)."""
    from galleries.models import Gallery

    if not user.has_perm("galleries.change_gallery"):
        return [], None
    if not user_is_team_scoped(user):
        return [], reverse("wagtailsnippets_galleries_gallery:list")
    galleries = Gallery.objects.filter(team_id__in=team_ids_for_user(user)).order_by(
        "title"
    )
    return [
        {
            "label": gallery.title,
            "url": reverse("wagtailsnippets_galleries_gallery:edit", args=[gallery.pk]),
        }
        for gallery in galleries[:MAX_LISTED]
    ], None


def _map_items(user):
    """A team-scoped member's map modules — edit links for module editors
    (super partners), inspect links otherwise."""
    from datastore.models import DistrictrMap

    if not user_is_team_scoped(user):
        return []
    view = "edit" if user.has_perm("datastore.change_districtrmap") else "inspect"
    try:
        # Savepoint: if the mirror table is absent (cms-only database), roll
        # back cleanly instead of poisoning the surrounding transaction.
        with transaction.atomic():
            maps = scoped_queryset(DistrictrMap, "team_links__team_id", user).order_by(
                "name"
            )
            return [
                {
                    "label": districtr_map.name,
                    "url": reverse(
                        f"wagtailsnippets_datastore_districtrmap:{view}",
                        args=[districtr_map.pk],
                    ),
                }
                for districtr_map in maps[:MAX_LISTED]
            ]
    except ProgrammingError:
        return []


class DistrictrShortcutsPanel(Component):
    name = "districtr_shortcuts"
    order = 50  # above every stock panel (110+)
    template_name = "core/home/districtr_shortcuts.html"

    def __init__(self, request):
        self.request = request

    def get_context_data(self, parent_context):
        user = self.request.user
        links = []

        if _in_shortcut_groups(user):
            links.append(
                {
                    "label": "Review portal submissions",
                    "url": reverse("moderation_review_portals"),
                    "icon": "glasses",
                }
            )
            add_portal_url = _add_portal_page_url()
            if add_portal_url:
                links.append(
                    {
                        "label": "Add a portal page",
                        "url": add_portal_url,
                        "icon": "doc-empty-inverse",
                    }
                )

        # The data tools ride on their server-side permission gates
        # (datastore/views.py): admin + super_partner.
        if user.has_perm("datastore.add_districtrmap"):
            links.append(
                {
                    "label": "Compose map module",
                    "url": reverse("datastore_compose_map"),
                    "icon": "cogs",
                }
            )
        if user.has_perm("datastore.add_overlay"):
            links.append(
                {
                    "label": "Upload overlay",
                    "url": reverse("datastore_upload_overlay"),
                    "icon": "sliders",
                }
            )

        if _is_admin(user):
            links.append(
                {
                    "label": "Teams",
                    "url": reverse("wagtailsnippets_authapi_team:list"),
                    "icon": "group",
                }
            )
            links.append(
                {
                    "label": "Review tag scopes",
                    "url": reverse("wagtailsnippets_authapi_reviewtagassignment:list"),
                    "icon": "tag",
                }
            )
            links.append(
                {
                    "label": "Frontend settings",
                    "url": reverse("moderation_site_settings"),
                    "icon": "cog",
                }
            )
            links.append(
                {
                    "label": "Awaiting your review",
                    "url": reverse("wagtailadmin_reports:workflow_tasks"),
                    "icon": "clipboard-list",
                }
            )

        galleries, galleries_index_url = ([], None)
        if _in_shortcut_groups(user):
            galleries, galleries_index_url = _gallery_items(user)
        if galleries_index_url:
            links.append(
                {
                    "label": "Galleries",
                    "url": galleries_index_url,
                    "icon": "folder-open-inverse",
                }
            )

        return {
            "links": links,
            "galleries": galleries,
            "maps": _map_items(user) if _in_shortcut_groups(user) else [],
        }


@hooks.register("construct_homepage_panels")
def add_districtr_shortcuts_panel(request, panels):
    panels.insert(0, DistrictrShortcutsPanel(request))


@hooks.register("construct_main_menu")
def trim_main_menu(request, menu_items):
    # Reports (locked pages, workflows, site history …) is admin housekeeping;
    # partners and super partners never need it. For admins it reads better
    # as "Admin analytics".
    if not _is_admin(request.user):
        menu_items[:] = [item for item in menu_items if item.name != "reports"]
    else:
        for item in menu_items:
            if item.name == "reports":
                item.label = "Admin analytics"


@hooks.register("insert_global_admin_css")
def districtr_admin_css():
    return format_html('<link rel="stylesheet" href="{}">', static("core/admin.css"))
