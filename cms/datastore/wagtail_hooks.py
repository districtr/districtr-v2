"""
Wagtail admin registration for the datastore mirrors.

Everything is grouped under a single "Data" menu item (database icon) via a
SnippetViewSetGroup. Snippets respect Django model permissions: the `admin`
group is granted all datastore permissions by the 0002 data migration;
editors/reviewers/partners get none by default, so the menu simply does not
appear for them.

FK widgets: because the target models are registered as snippets, ForeignKeys
to them automatically render as snippet choosers (search + pagination, 10 per
page) rather than unbounded <select> dropdowns. The exception is
DistrictrMap.parent_layer/child_layer, which reference GerryDBTable.name
(a non-pk to_field) — Wagtail's chooser resolves values by pk, so those two
panels force a plain Django select instead.
"""

from functools import cached_property

from django import forms
from django.conf import settings
from django.http import Http404
from django.urls import path, reverse
from wagtail import hooks
from wagtail.admin.menu import MenuItem
from wagtail.admin.panels import FieldPanel, MultiFieldPanel, ObjectList
from wagtail.permission_policies.base import ModelPermissionPolicy
from wagtail.snippets.models import register_snippet
from wagtail.snippets.views.snippets import (
    InspectView,
    SnippetViewSet,
    SnippetViewSetGroup,
)

from authapi.teams import (
    TeamScopedViewGrantPermissionPolicy,
    scoped_queryset,
    user_is_team_scoped,
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
from datastore.views import DATASTORE_ADMIN_PERMISSION, OVERLAY_ADMIN_PERMISSION

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


class TeamScopedMapInspectView(InspectView):
    """InspectView that 404s when a team-scoped member opens a Districtr map
    outside their groups by URL — get_object() fetches straight from the model,
    so the index get_queryset filter alone wouldn't stop a guessed UUID."""

    def get_object(self, queryset=None):
        obj = super().get_object(queryset)
        if (
            user_is_team_scoped(self.request.user)
            and not scoped_queryset(
                self.model, DISTRICTRMAP_GROUP_FIELD, self.request.user
            )
            .filter(pk=obj.pk)
            .exists()
        ):
            raise Http404
        return obj


class DistrictrMapViewSet(SnippetViewSet):
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

    # Team-scoped members may browse (view/inspect) only the Districtr maps in
    # their teams' groups; admins keep full edit access (authapi/teams.py).
    def get_queryset(self, request):
        if user_is_team_scoped(request.user):
            return scoped_queryset(self.model, DISTRICTRMAP_GROUP_FIELD, request.user)
        return None

    @property
    def permission_policy(self):
        return TeamScopedViewGrantPermissionPolicy(
            self.model, group_filter_field=DISTRICTRMAP_GROUP_FIELD
        )

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
        # JSONField renders as a plain JSON textarea by default.
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
    # Both FKs render as snippet choosers (paginated), not giant dropdowns.
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
    # Both FKs render as snippet choosers (paginated), not giant dropdowns.
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


# ---------------------------------------------------------------------------
# Cross-links to the legacy review pages on the Next.js frontend
# ---------------------------------------------------------------------------

# Group gate for the Comment review cross-link, matching the FastAPI scope the
# page needs (authapi/scopes.py): create:content_review (admin + reviewer;
# editors lack it). The page enforces auth itself, so this only controls menu
# visibility — but a link the user's token can only 403 on must not be shown.
# Partners never see it.
COMMENT_REVIEW_GROUPS = frozenset({"admin", "reviewer"})


class ReviewSiteMenuItem(MenuItem):
    """Top-level external link to a legacy review page on the frontend,
    shown only to superusers and members of ``groups``."""

    def __init__(self, *args, groups=COMMENT_REVIEW_GROUPS, **kwargs):
        self.groups = groups
        super().__init__(*args, **kwargs)

    def is_shown(self, request):
        user = request.user
        if user.is_superuser:
            return True
        return user.groups.filter(name__in=self.groups).exists()


@hooks.register("register_admin_menu_item")
def register_comment_review_menu_item():
    # Ordered right after Galleries (210).
    return ReviewSiteMenuItem(
        "Comment review",
        f"{settings.FRONTEND_URL}/admin/review",
        icon_name="link-external",
        order=220,
        groups=COMMENT_REVIEW_GROUPS,
    )
