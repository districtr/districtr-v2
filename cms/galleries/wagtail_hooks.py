"""
Wagtail admin registration for galleries.

Galleries get their own top-level "Galleries" menu item rather than joining
the datastore "Data" SnippetViewSetGroup: the Data group is for admins and
super partners (partners hold no datastore permissions, so that menu never
renders for them), while galleries are exactly the thing partners curate.

Permission model (galleries/migrations/0002 + authapi.0007):
- partner/super_partner: add/change Gallery -> sees the menu, creates and
  edits DRAFTS. Without `publish_gallery` the edit view shows "Save draft"
  but no "Publish" action, so partner work stays unpublished.
- admin: full model perms + `publish_gallery` -> the same edit view
  additionally offers Publish/Unpublish.

The draft/publish UI comes for free: Gallery uses DraftStateMixin +
RevisionMixin, so SnippetViewSet renders the Save draft / Publish split
button and the live/draft status column automatically.

Moderation workflow: Gallery mixes in WorkflowMixin, and content.0007
provisions the "Admin approval" workflow wired to the Gallery snippet type
(and the page tree), so partners get "Submit for moderation" and admins
approve/publish. Workflows stay enabled by default via the
WAGTAIL_WORKFLOW_ENABLED setting (unset = True).
"""

from django import forms
from wagtail import hooks
from wagtail.admin.auth import permission_denied
from wagtail.admin.panels import FieldPanel, InlinePanel
from wagtail.admin.ui.tables import LiveStatusTagColumn
from wagtail.snippets.models import register_snippet
from wagtail.snippets.views.snippets import (
    CopyView,
    CreateView,
    EditView,
    SnippetViewSet,
)

from authapi.models import Team
from authapi.teams import (
    TeamScopedGetObjectMixin,
    TeamScopedViewSetMixin,
    instance_in_scope,
    team_ids_for_user,
    user_is_team_scoped,
)
from galleries.models import Gallery

# Galleries reach their Team through the direct team FK.
GALLERY_TEAM_FIELD = "team_id"


def _restrict_team_field(form, user):
    """For a team-scoped member, narrow the gallery's team field to their own
    teams so they can't create a gallery outside their scope. Admins keep the
    full chooser.

    Snippet create/edit views don't pass ``for_user`` to the form, so this runs
    from the view where ``request.user`` is available. Setting the queryset is
    the hard guard — ModelChoiceField rejects an out-of-scope submitted pk.
    """
    field = form.fields.get("team")
    if field is not None and user_is_team_scoped(user):
        field.queryset = Team.objects.filter(pk__in=team_ids_for_user(user))
        field.widget = forms.Select()
    return form


class TeamScopedGalleryCreateView(CreateView):
    def get_form(self, *args, **kwargs):
        return _restrict_team_field(
            super().get_form(*args, **kwargs), self.request.user
        )


class TeamScopedGalleryEditView(EditView):
    def get_form(self, *args, **kwargs):
        return _restrict_team_field(
            super().get_form(*args, **kwargs), self.request.user
        )


class TeamScopedGalleryCopyView(TeamScopedGetObjectMixin, CopyView):
    """Copy prefills from the source object with only a bare get_object_or_404
    upstream — the mixin 404s out-of-scope sources, and the form restriction
    keeps the copy's team inside the member's teams."""

    team_filter_field = GALLERY_TEAM_FIELD

    def get_form(self, *args, **kwargs):
        return _restrict_team_field(
            super().get_form(*args, **kwargs), self.request.user
        )


class GalleryViewSet(TeamScopedViewSetMixin, SnippetViewSet):
    model = Gallery
    icon = "image"
    menu_label = "Galleries"
    menu_order = 210  # right after the "Data" group (200)
    add_to_admin_menu = True
    list_display = [
        "title",
        "slug",
        "section",
        "team",
        "visibility",
        LiveStatusTagColumn(),
    ]
    list_filter = ["section", "visibility"]
    search_fields = ["title", "slug"]
    list_per_page = 50
    add_view_class = TeamScopedGalleryCreateView
    edit_view_class = TeamScopedGalleryEditView
    copy_view_class = TeamScopedGalleryCopyView
    team_filter_field = GALLERY_TEAM_FIELD

    panels = [
        FieldPanel("title"),
        FieldPanel("slug"),
        FieldPanel("section"),
        FieldPanel("team"),
        FieldPanel("visibility"),
        FieldPanel("description"),
        InlinePanel("entries", heading="Plans", label="Plan"),
    ]


register_snippet(GalleryViewSet)


def _gallery_out_of_scope(request, instance):
    """True when a team-scoped user is acting on a gallery outside their teams.

    The snippet object views fetch from the unscoped manager and only check
    model-level permission, so the index `get_queryset` filter is not enough —
    these hooks are the hard gate against direct-URL access.
    """
    return isinstance(instance, Gallery) and not instance_in_scope(
        request.user, Gallery, GALLERY_TEAM_FIELD, instance.pk
    )


@hooks.register("before_edit_snippet")
@hooks.register("before_unpublish")  # snippet UnpublishView fires only this
def deny_out_of_team_gallery_edit(request, instance):
    if _gallery_out_of_scope(request, instance):
        return permission_denied(request)


@hooks.register("before_delete_snippet")
def deny_out_of_team_gallery_delete(request, instances):
    if any(_gallery_out_of_scope(request, obj) for obj in instances):
        return permission_denied(request)
