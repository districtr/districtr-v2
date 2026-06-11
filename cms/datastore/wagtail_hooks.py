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
from wagtail import hooks
from wagtail.admin.panels import FieldPanel, MultiFieldPanel, ObjectList
from wagtail.permission_policies.base import ModelPermissionPolicy
from wagtail.snippets.models import register_snippet
from wagtail.snippets.views.snippets import SnippetViewSet, SnippetViewSetGroup

from datastore.models import (
    DistrictrMap,
    DistrictrMapOverlays,
    DistrictrMapsToGroups,
    GerryDBTable,
    MapGroup,
    Overlay,
)


@hooks.register("register_icons")
def register_icons(icons):
    return icons + ["datastore/icons/database.svg"]


class ReadOnlyModelPermissionPolicy(ModelPermissionPolicy):
    """Deny all writes — even for superusers — while keeping view access."""

    def user_has_permission(self, user, action):
        if action in {"add", "change", "delete"}:
            return False
        return super().user_has_permission(user, action)


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


register_snippet(DataViewSetGroup)
