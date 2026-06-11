"""
Wagtail admin registration for galleries.

Galleries get their own top-level "Galleries" menu item rather than joining
the datastore "Data" SnippetViewSetGroup: the Data group is admin-only
(editors/reviewers/partners hold no datastore permissions, so that menu never
renders for them), while galleries are exactly the thing partners curate.

Permission model (galleries/migrations/0002):
- partner: add/change Gallery -> sees the menu, creates and edits DRAFTS.
  Without `publish_gallery` the editor shows "Save draft" but no "Publish"
  action, so partner work stays unpublished.
- editor/admin: full model perms + `publish_gallery` -> the same edit view
  additionally offers Publish/Unpublish.

The draft/publish UI comes for free: Gallery uses DraftStateMixin +
RevisionMixin, so SnippetViewSet renders the Save draft / Publish split
button and the live/draft status column automatically.

Moderation workflows (optional): Gallery also mixes in WorkflowMixin, so a
full approval flow needs no code — in the admin, create a Workflow with a
"group approval" task for the editor group (Settings -> Workflows) and
assign it to the Gallery snippet type. Partners then get "Submit for
moderation" instead of publishing directly. Workflows stay enabled by
default via the WAGTAIL_WORKFLOW_ENABLED setting (unset = True); we do not
pre-provision one.
"""

from django import forms
from wagtail import hooks
from wagtail.admin.auth import permission_denied
from wagtail.admin.panels import FieldPanel, InlinePanel
from wagtail.admin.ui.tables import LiveStatusTagColumn
from wagtail.snippets.models import register_snippet
from wagtail.snippets.views.snippets import CreateView, EditView, SnippetViewSet

from authapi.teams import (
    TeamScopedModelPermissionPolicy,
    map_group_slugs_for_user,
    scoped_queryset,
    user_is_team_scoped,
)
from datastore.models import MapGroup
from galleries.models import Gallery

# Galleries reach a MapGroup through their direct map_group FK.
GALLERY_GROUP_FIELD = "map_group_id"


def _restrict_map_group_field(form, user):
    """For a team-scoped member, narrow the gallery's map_group field to the
    groups their teams own (a required dropdown, not the all-groups chooser) so
    they can't create a gallery outside their scope. Admins keep the chooser.

    Snippet create/edit views don't pass ``for_user`` to the form, so this runs
    from the view where ``request.user`` is available. Setting the queryset is
    the hard guard — ModelChoiceField rejects an out-of-scope submitted pk.
    """
    field = form.fields.get("map_group")
    if field is not None and user_is_team_scoped(user):
        field.queryset = MapGroup.objects.filter(
            slug__in=map_group_slugs_for_user(user)
        )
        field.required = True
        field.widget = forms.Select()
    return form


class TeamScopedGalleryCreateView(CreateView):
    def get_form(self, *args, **kwargs):
        return _restrict_map_group_field(
            super().get_form(*args, **kwargs), self.request.user
        )


class TeamScopedGalleryEditView(EditView):
    def get_form(self, *args, **kwargs):
        return _restrict_map_group_field(
            super().get_form(*args, **kwargs), self.request.user
        )


class GalleryViewSet(SnippetViewSet):
    model = Gallery
    icon = "image"
    menu_label = "Galleries"
    menu_order = 210  # right after the "Data" group (200)
    add_to_admin_menu = True
    list_display = [
        "title",
        "slug",
        "section",
        "visibility",
        LiveStatusTagColumn(),
    ]
    list_filter = ["section", "visibility"]
    search_fields = ["title", "slug"]
    list_per_page = 50
    add_view_class = TeamScopedGalleryCreateView
    edit_view_class = TeamScopedGalleryEditView

    panels = [
        FieldPanel("title"),
        FieldPanel("slug"),
        FieldPanel("section"),
        FieldPanel("map_group"),
        FieldPanel("visibility"),
        FieldPanel("description"),
        InlinePanel("entries", heading="Plans", label="Plan"),
    ]

    # Team-scoped members see/edit only galleries whose map_group their teams
    # own; admins/superusers/team-less users are unaffected (authapi/teams.py).
    def get_queryset(self, request):
        if user_is_team_scoped(request.user):
            return scoped_queryset(self.model, GALLERY_GROUP_FIELD, request.user)
        return None

    @property
    def permission_policy(self):
        return TeamScopedModelPermissionPolicy(
            self.model, group_filter_field=GALLERY_GROUP_FIELD
        )


register_snippet(GalleryViewSet)


def _gallery_out_of_scope(request, instance):
    """True when a team-scoped user is acting on a gallery outside their groups.

    The snippet object views (edit/delete) fetch from the unscoped manager and
    only check model-level permission, so the index `get_queryset` filter is not
    enough — these hooks are the hard gate against direct-URL access.
    """
    return (
        isinstance(instance, Gallery)
        and user_is_team_scoped(request.user)
        and not scoped_queryset(Gallery, GALLERY_GROUP_FIELD, request.user)
        .filter(pk=instance.pk)
        .exists()
    )


@hooks.register("before_edit_snippet")
def deny_out_of_team_gallery_edit(request, instance):
    if _gallery_out_of_scope(request, instance):
        return permission_denied(request)


@hooks.register("before_delete_snippet")
def deny_out_of_team_gallery_delete(request, instances):
    if any(_gallery_out_of_scope(request, obj) for obj in instances):
        return permission_denied(request)
