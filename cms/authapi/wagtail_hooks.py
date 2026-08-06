"""
Wagtail admin registration for per-user review scoping.

"Review tag scopes" is a top-level menu item visible to the admin group
only: snippets respect Django model permissions, and only `admin` holds the
ReviewTagAssignment permissions (granted by authapi/migrations/0003).
Assignments take effect at the assignee's next login — claims are minted on
the refresh token at token obtain (authapi/serializers.py), so an existing
session keeps its old `review_tags` through silent refreshes.

The user field uses a generic ChooserViewSet (searchable, paginated) rather
than an unbounded <select>. register_widget stays False so the chooser only
applies where the panel asks for it — other ForeignKeys to User across the
admin are unaffected.
"""

from django import forms
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.shortcuts import redirect
from wagtail import hooks
from wagtail.admin import messages
from wagtail.admin.forms.choosers import BaseFilterForm
from wagtail.admin.panels import FieldPanel, InlinePanel
from wagtail.admin.viewsets.chooser import ChooserViewSet
from wagtail.snippets.models import register_snippet
from wagtail.snippets.views.snippets import SnippetViewSet

from authapi.models import ReviewTagAssignment, Team


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


class ReviewTagAssignmentViewSet(SnippetViewSet):
    model = ReviewTagAssignment
    icon = "tag"
    menu_label = "Review tag scopes"
    menu_order = 250  # after the frontend review cross-links (220-240)
    add_to_admin_menu = True
    list_display = ["user", "tag_slug"]
    search_fields = ["user__username", "user__email", "tag_slug"]
    list_per_page = 50

    panels = [
        FieldPanel("user", widget=user_chooser_viewset.widget_class),
        FieldPanel("tag_slug"),
    ]


register_snippet(ReviewTagAssignmentViewSet)


class TeamViewSet(SnippetViewSet):
    """Admin-only "Teams" snippet: name a team, add member users, and assign
    the Districtr map modules it owns. Only the `admin` group holds Team permissions
    (authapi/migrations/0005), so the menu item never renders for other roles.

    Membership/ownership take effect immediately for the Wagtail admin scoping
    (authapi/teams.py) — no token round-trip, since this scoping is server-side
    in the CMS, not carried in a JWT claim.
    """

    model = Team
    icon = "group"
    menu_label = "Teams"
    menu_order = 260  # after "Review tag scopes" (250)
    add_to_admin_menu = True
    list_display = ["name", "slug"]
    search_fields = ["name", "slug"]
    list_per_page = 50

    panels = [
        FieldPanel("name"),
        FieldPanel("slug"),
        InlinePanel(
            "memberships",
            heading="Members",
            label="Member",
            panels=[FieldPanel("user", widget=user_chooser_viewset.widget_class)],
        ),
        InlinePanel(
            "districtr_maps",
            heading="Map modules assigned",
            label="Map module",
            panels=[FieldPanel("districtr_map")],
        ),
    ]


register_snippet(TeamViewSet)


def _deny_team_delete_with_galleries(request, teams):
    """Gallery.team is PROTECT: deleting a team that still owns galleries
    would otherwise surface as an unhandled ProtectedError (500). Mirrors the
    maps-with-plans guard in datastore/wagtail_hooks.py."""
    from galleries.models import Gallery

    counts = {
        team: Gallery.objects.filter(team=team).count()
        for team in sorted(teams, key=lambda team: team.name)
    }
    counts = {team: count for team, count in counts.items() if count}
    if not counts:
        return None
    summary = ", ".join(
        f"{team.name} ({count} galler{'ies' if count != 1 else 'y'})"
        for team, count in counts.items()
    )
    messages.error(
        request,
        f"Cannot delete teams that still own galleries: {summary}. "
        "Reassign or delete their galleries first.",
    )
    return redirect("wagtailsnippets_authapi_team:list")


@hooks.register("before_delete_snippet")
def deny_team_delete_with_galleries(request, instances):
    teams = [obj for obj in instances if isinstance(obj, Team)]
    if teams:
        return _deny_team_delete_with_galleries(request, teams)


@hooks.register("before_bulk_action")
def deny_team_bulk_delete_with_galleries(request, action_type, objects, action):
    if action_type != "delete":
        return None
    teams = [obj for obj in objects if isinstance(obj, Team)]
    if teams:
        return _deny_team_delete_with_galleries(request, teams)
