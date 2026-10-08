"""
Wagtail admin registration for teams (the tenancy boundary), plus the
"Download data" menu item for the data-extract page.

Team changes take effect on the member's next request: the CMS mints a
fresh backend token for every call (mint_user_access_token), reading the
`teams` claim from current membership. There are no refresh tokens.

The user field uses a generic ChooserViewSet (searchable, paginated) rather
than an unbounded <select>. register_widget stays False so the chooser only
applies where the panel asks for it — other ForeignKeys to User across the
admin are unaffected.
"""

from django import forms
from django.contrib.auth import get_user_model
from django.db.models import Q
from wagtail import hooks
from wagtail.admin.forms.choosers import BaseFilterForm
from wagtail.admin.forms import WagtailAdminModelForm
from wagtail.admin.panels import FieldPanel, InlinePanel, ObjectList
from wagtail.admin.viewsets.chooser import ChooserViewSet
from wagtail.snippets.models import register_snippet
from wagtail.snippets.views.snippets import SnippetViewSet

from authapi.models import Team, TeamDistrictrMap
from authapi.views import EXTRACT_GROUPS, extract_page_url
from core.menu import GroupMenuItem
from datastore.models import DistrictrMap
from datastore.widgets import MapModulePickerWidget


class UserSearchFilterForm(BaseFilterForm):
    """Plain icontains search over username/email/name.

    The user model is not registered with wagtail.search, so the chooser's
    default search (SearchFilterMixin, backend-based) is unavailable; this
    filters the queryset directly instead.
    """

    q = forms.CharField(
        label="Search term",
        widget=forms.TextInput(attrs={"placeholder": "Search"}),
        required=False,
    )

    def filter(self, objects):
        objects = super().filter(objects)
        search_query = self.cleaned_data.get("q")
        if search_query:
            objects = objects.filter(
                Q(username__icontains=search_query)
                | Q(email__icontains=search_query)
                | Q(first_name__icontains=search_query)
                | Q(last_name__icontains=search_query)
            )
            self.is_searching = True
            self.search_query = search_query
        return objects


class UserChooserViewSet(ChooserViewSet):
    model = get_user_model()
    icon = "user"
    choose_one_text = "Choose a user"
    choose_another_text = "Choose another user"
    # Keep the chooser widget local to the panel below — don't override every
    # ForeignKey-to-User form field in the admin.
    register_widget = False

    def get_common_view_kwargs(self, **kwargs):
        return super().get_common_view_kwargs(
            filter_form_class=UserSearchFilterForm, **kwargs
        )


user_chooser_viewset = UserChooserViewSet("authapi_user_chooser")


@hooks.register("register_admin_viewset")
def register_user_chooser_viewset():
    return user_chooser_viewset


class TeamForm(WagtailAdminModelForm):
    """Team form with the map-module picker in place of one inline row per
    module; save() syncs the TeamDistrictrMap links to the picked set."""

    map_modules = forms.ModelMultipleChoiceField(
        queryset=DistrictrMap.objects.order_by("name"),
        required=False,
        label="Map modules assigned",
        widget=MapModulePickerWidget(multiple=True, lookup="pk"),
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance.pk:
            self.initial["map_modules"] = list(
                self.instance.districtr_maps.values_list("districtr_map_id", flat=True)
            )

    def save(self, commit=True):
        # Reuse existing link rows so unchanged grants keep their pk.
        existing = {
            link.districtr_map_id: link for link in self.instance.districtr_maps.all()
        }
        self.instance.districtr_maps = [
            existing.get(districtr_map.pk)
            or TeamDistrictrMap(districtr_map_id=districtr_map.pk)
            for districtr_map in self.cleaned_data["map_modules"]
        ]
        return super().save(commit)


class TeamViewSet(SnippetViewSet):
    """Admin-only "Teams" snippet: name a team, add member users, and assign
    the Districtr map modules it owns. Only the `admin` group holds Team permissions
    (authapi/migrations/0002_provision_roles), so the menu item never renders for other roles.

    Membership/ownership take effect immediately for the Wagtail admin scoping
    (authapi/teams.py) — no token round-trip, since this scoping is server-side
    in the CMS, not carried in a JWT claim.
    """

    model = Team
    icon = "group"
    menu_label = "Teams"
    menu_order = 260
    add_to_admin_menu = True
    list_display = ["name", "slug"]
    search_fields = ["name", "slug"]
    list_per_page = 50

    edit_handler = ObjectList(
        [
            FieldPanel("name"),
            FieldPanel("slug"),
            InlinePanel(
                "memberships",
                heading="Members",
                label="Member",
                panels=[FieldPanel("user", widget=user_chooser_viewset.widget_class)],
            ),
            FieldPanel("map_modules"),
        ],
        base_form_class=TeamForm,
    )


register_snippet(TeamViewSet)


@hooks.register("register_admin_menu_item")
def register_extract_menu_item():
    return GroupMenuItem(
        "Download data",
        url=extract_page_url(),
        icon_name="download",
        attrs={"target": "_blank", "rel": "noopener"},
        order=900,
        groups=EXTRACT_GROUPS,
    )
