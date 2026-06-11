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

from wagtail.admin.panels import FieldPanel, InlinePanel
from wagtail.admin.ui.tables import LiveStatusTagColumn
from wagtail.snippets.models import register_snippet
from wagtail.snippets.views.snippets import SnippetViewSet

from galleries.models import Gallery


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

    panels = [
        FieldPanel("title"),
        FieldPanel("slug"),
        FieldPanel("section"),
        FieldPanel("map_group"),
        FieldPanel("visibility"),
        FieldPanel("description"),
        InlinePanel("entries", heading="Plans", label="Plan"),
    ]


register_snippet(GalleryViewSet)
