"""
Wagtail admin registration for the datastore mirrors.

Everything is grouped under a single "Data" menu item (database icon) via a
SnippetViewSetGroup. Snippets respect Django model permissions: the `admin`
group is granted all datastore permissions by the 0002 data migration and
`super_partner` gets the map-module/overlay subset by authapi.0007; partners
get none, so the menu simply does not appear for them.

FK widgets: because the target models are registered as snippets, ForeignKeys
to them automatically render as snippet choosers (search + pagination, 10 per
page) rather than unbounded <select> dropdowns. The exception is
DistrictrMap.parent_layer/child_layer, which reference GerryDBTable.name
(a non-pk to_field) — Wagtail's chooser resolves values by pk, so those two
panels force a plain Django select instead.
"""

from functools import cached_property

from django import forms
from django.db import ProgrammingError, connection
from django.shortcuts import redirect
from django.urls import path, reverse
from wagtail import hooks
from wagtail.admin import messages
from wagtail.admin.menu import MenuItem
from wagtail.admin.panels import FieldPanel, MultiFieldPanel, ObjectList
from wagtail.permission_policies.base import ModelPermissionPolicy
from wagtail.snippets.models import register_snippet
from wagtail.snippets.views.snippets import (
    HistoryView,
    InspectView,
    SnippetViewSet,
    SnippetViewSetGroup,
    UsageView,
)

from authapi.teams import (
    TeamScopedGetObjectMixin,
    TeamScopedViewGrantPermissionPolicy,
    TeamScopedViewSetMixin,
)
from datastore import views
from datastore.models import (
    DistrictrMap,
    DistrictrMapOverlays,
    DistrictrMapsToGroups,
    GerryDBTable,
    MapGroup,
    Overlay,
)
from datastore.views import (
    DATASTORE_ADMIN_PERMISSION,
    GPKG_IMPORT_PERMISSION,
    OVERLAY_ADMIN_PERMISSION,
)

# DistrictrMap reaches a MapGroup through the DistrictrMapsToGroups link table
# (related_name "group_links"); group_id is the MapGroup slug (its pk).
DISTRICTRMAP_GROUP_FIELD = "group_links__group_id"


@hooks.register("register_icons")
def register_icons(icons):
    return icons + ["datastore/icons/database.svg"]


class ReadOnlyModelPermissionPolicy(ModelPermissionPolicy):
    """Deny all writes — even for superusers — while keeping view access."""

    def user_has_permission(self, user, action):
        if action in {"add", "change", "delete"}:
            return False
        return super().user_has_permission(user, action)


class _MapScoped(TeamScopedGetObjectMixin):
    """404 out-of-scope Districtr maps on the object views that fetch straight
    from the model (inspect/history/usage) — the index get_queryset filter
    alone wouldn't stop a guessed UUID."""

    group_filter_field = DISTRICTRMAP_GROUP_FIELD


class TeamScopedMapInspectView(_MapScoped, InspectView):
    pass


class TeamScopedMapHistoryView(_MapScoped, HistoryView):
    pass


class TeamScopedMapUsageView(_MapScoped, UsageView):
    pass


class DistrictrMapViewSet(TeamScopedViewSetMixin, SnippetViewSet):
    model = DistrictrMap
    icon = "globe"
    menu_label = "Districtr maps"
    list_display = [
        "name",
        "districtr_map_slug",
        "num_districts",
        "map_type",
        "visible",
    ]
    list_filter = ["visible", "map_type"]
    search_fields = ["name", "districtr_map_slug"]
    list_per_page = 50
    inspect_view_enabled = True
    inspect_view_class = TeamScopedMapInspectView
    history_view_class = TeamScopedMapHistoryView
    usage_view_class = TeamScopedMapUsageView

    # Team-scoped members may browse (view/inspect) only the Districtr maps in
    # their teams' groups; admins keep full edit access (authapi/teams.py).
    group_filter_field = DISTRICTRMAP_GROUP_FIELD
    permission_policy_class = TeamScopedViewGrantPermissionPolicy

    # created_at/updated_at are auto-managed (auto_now_add/auto_now) and thus
    # not editable; every other mapped field is on the form.
    edit_handler = ObjectList(
        [
            MultiFieldPanel(
                [
                    FieldPanel("uuid", read_only=True),
                    FieldPanel("name"),
                    FieldPanel("districtr_map_slug"),
                    FieldPanel("map_type"),
                    FieldPanel("data_source_name"),
                    FieldPanel("statefps"),
                ],
                heading="Identity",
            ),
            MultiFieldPanel(
                [
                    FieldPanel("gerrydb_table_name"),
                    FieldPanel("parent_layer", widget=forms.Select),
                    FieldPanel("child_layer", widget=forms.Select),
                    FieldPanel("parent_geo_unit_type"),
                    FieldPanel("child_geo_unit_type"),
                ],
                heading="Layers",
            ),
            MultiFieldPanel(
                [
                    FieldPanel("num_districts"),
                    FieldPanel("num_districts_modifiable"),
                ],
                heading="Districts",
            ),
            MultiFieldPanel(
                [
                    FieldPanel("tiles_s3_path"),
                    FieldPanel("extent"),
                ],
                heading="Tiles",
            ),
            MultiFieldPanel(
                [
                    FieldPanel("visible"),
                    FieldPanel("comment"),
                    FieldPanel("comment_length_limit"),
                    FieldPanel("comment_count_limit"),
                ],
                heading="Moderation",
            ),
        ]
    )


class MapGroupViewSet(SnippetViewSet):
    model = MapGroup
    icon = "folder-open-inverse"
    menu_label = "Map groups"
    list_display = ["name", "slug"]
    search_fields = ["name", "slug"]
    list_per_page = 50
    panels = [
        FieldPanel("slug"),
        FieldPanel("name"),
    ]


class OverlayViewSet(SnippetViewSet):
    model = Overlay
    icon = "sliders"
    menu_label = "Overlays"
    list_display = ["name", "data_type", "layer_type", "source"]
    list_filter = ["data_type", "layer_type"]
    search_fields = ["name", "description"]
    list_per_page = 50
    panels = [
        FieldPanel("overlay_id", read_only=True),
        FieldPanel("name"),
        FieldPanel("description"),
        FieldPanel("data_type"),
        FieldPanel("layer_type"),
        FieldPanel("custom_style", widget=forms.Textarea),
        FieldPanel("source"),
        FieldPanel("source_layer"),
        FieldPanel("id_property"),
    ]


class DistrictrMapsToGroupsViewSet(SnippetViewSet):
    model = DistrictrMapsToGroups
    icon = "link"
    menu_label = "Map \N{LEFT RIGHT ARROW} group links"
    list_display = ["districtrmap", "group"]
    list_filter = ["group"]
    list_per_page = 50
    panels = [
        FieldPanel("districtrmap"),
        FieldPanel("group"),
    ]


class DistrictrMapOverlaysViewSet(SnippetViewSet):
    model = DistrictrMapOverlays
    icon = "link"
    menu_label = "Map \N{LEFT RIGHT ARROW} overlay links"
    list_display = ["districtr_map", "overlay"]
    list_per_page = 50
    panels = [
        FieldPanel("districtr_map"),
        FieldPanel("overlay"),
    ]


class GerryDBTableViewSet(SnippetViewSet):
    """Read-only: GerryDB tables come from the import pipeline, not the CMS."""

    model = GerryDBTable
    icon = "table"
    menu_label = "GerryDB tables"
    list_display = ["name", "uuid", "created_at", "updated_at"]
    search_fields = ["name"]
    list_per_page = 50
    inspect_view_enabled = True

    @cached_property
    def permission_policy(self):
        return ReadOnlyModelPermissionPolicy(self.model)


class DataToolMenuItem(MenuItem):
    """Submenu entry for the data-ops tool pages (import, overlays, compose,
    thumbnails).

    Mirrors the snippet permission gate: only users who may add datastore
    rows (the admin group) see — or may use — the tools. Each tool view
    enforces the same permission server-side.
    """

    def __init__(self, *args, permission=DATASTORE_ADMIN_PERMISSION, **kwargs):
        self.permission = permission
        super().__init__(*args, **kwargs)

    def is_shown(self, request):
        return request.user.has_perm(self.permission)


class DataViewSetGroup(SnippetViewSetGroup):
    menu_label = "Data"
    menu_icon = "database"
    menu_order = 200
    items = (
        DistrictrMapViewSet,
        MapGroupViewSet,
        OverlayViewSet,
        DistrictrMapsToGroupsViewSet,
        DistrictrMapOverlaysViewSet,
        GerryDBTableViewSet,
    )

    def get_submenu_items(self):
        # Append the tool pages after the snippet listings, inside the same
        # "Data" group menu.
        menu_items = super().get_submenu_items()
        order = len(menu_items) + 1
        menu_items.append(
            DataToolMenuItem(
                "Import GeoPackage",
                reverse("datastore_import_gpkg"),
                icon_name="upload",
                order=order,
                permission=GPKG_IMPORT_PERMISSION,
            )
        )
        menu_items.append(
            DataToolMenuItem(
                "Upload overlay",
                reverse("datastore_upload_overlay"),
                icon_name="sliders",
                order=order + 1,
                permission=OVERLAY_ADMIN_PERMISSION,
            )
        )
        menu_items.append(
            DataToolMenuItem(
                "Compose map module",
                reverse("datastore_compose_map"),
                icon_name="cogs",
                order=order + 2,
            )
        )
        menu_items.append(
            DataToolMenuItem(
                "Thumbnails",
                reverse("datastore_thumbnails"),
                icon_name="image",
                order=order + 3,
            )
        )
        return menu_items


register_snippet(DataViewSetGroup)


def _map_slugs_with_documents(slugs):
    """Saved-plan counts per map slug, read straight from the shared database.

    document.document is deliberately not mirrored (datastore/models.py), so
    this is a raw read. Purely UX: its FK to districtrmap has NO ACTION, so
    the database still hard-blocks such deletes if this check misses.
    """
    if not slugs:
        return {}
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT districtr_map_slug, count(*) FROM document.document "
                "WHERE districtr_map_slug = ANY(%s) GROUP BY districtr_map_slug",
                [list(slugs)],
            )
            return dict(cursor.fetchall())
    except ProgrammingError:
        # Table absent (cms-only database): let the FK decide.
        return {}


def _deny_map_delete_with_documents(request, maps):
    counts = _map_slugs_with_documents([m.districtr_map_slug for m in maps])
    if not counts:
        return None
    summary = ", ".join(
        f"{slug} ({count} plan{'s' if count != 1 else ''})"
        for slug, count in sorted(counts.items())
    )
    messages.error(
        request,
        f"Cannot delete maps that have saved plans: {summary}. "
        "Hide a retired map by unsetting its visible flag instead.",
    )
    return redirect("wagtailsnippets_datastore_districtrmap:list")


@hooks.register("before_delete_snippet")
def deny_districtrmap_delete_with_documents(request, instances):
    maps = [obj for obj in instances if isinstance(obj, DistrictrMap)]
    if maps:
        return _deny_map_delete_with_documents(request, maps)


@hooks.register("before_bulk_action")
def deny_districtrmap_bulk_delete_with_documents(request, action_type, objects, action):
    if action_type != "delete":
        return None
    maps = [obj for obj in objects if isinstance(obj, DistrictrMap)]
    if maps:
        return _deny_map_delete_with_documents(request, maps)


@hooks.register("register_admin_urls")
def register_datastore_admin_urls():
    # Mounted under /admin/ and wrapped in require_admin_access by Wagtail;
    # the views additionally require their datastore add permission.
    return [
        path("data/import-gpkg/", views.import_gpkg, name="datastore_import_gpkg"),
        path(
            "data/upload-overlay/",
            views.upload_overlay,
            name="datastore_upload_overlay",
        ),
        path("data/compose-map/", views.compose_map, name="datastore_compose_map"),
        path("data/thumbnails/", views.thumbnails, name="datastore_thumbnails"),
    ]
