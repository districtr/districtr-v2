"""
Wagtail page models replacing the legacy FastAPI CMS tables
(cms.tags_content / cms.places_content — see backend/app/cms/models.py).

Structure: two dedicated index pages (TagsIndexPage at /tags/,
PlacesIndexPage at /places/) under the site home page, one per locale.
Public lookup is therefore: page type + slug + locale — exactly the legacy
(content_type, slug, language) key. Translations are real Wagtail
translations (shared translation_key via copy_for_translation; wagtail-localize
handles the editor workflow), so there are no model-level unique constraints
beyond Wagtail's own (translation_key, locale).

Draft/published: Wagtail's revision system replaces the legacy
draft_content/published_content pair — the live revision is the published
doc, an unpublished revision on top is the draft.

PlacePage.districtr_map_slugs is an ArrayField rather than an Orderable
child model: it round-trips the legacy ``varchar[]`` column verbatim, needs
no extra join table, and the slugs are not translatable content.
"""

from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.core.exceptions import ValidationError
from django.db import DatabaseError, models, transaction
from wagtail.admin.panels import FieldPanel
from wagtail.fields import StreamField
from wagtail.models import Page
from wagtail.search import index
from wagtail_localize.fields import SynchronizedField

from content.blocks import ContentStreamBlock
from content.forms import PlacePageForm, TagPageForm


class FrontendPageMixin:
    """Pages Wagtail never serves itself: the Next.js frontend renders them
    from the JSON API (content/api.py).

    - ``preview_modes = []`` disables the editor Preview panel and the "View
      draft" button; there is no Django template, so previewing raised
      TemplateDoesNotExist 500s.
    - URL generation is redirected at the single choke point Wagtail
      documents for custom routing, ``get_url_parts``, so every derived link
      ("View live" in the editor header/listings/flash messages, usage
      reports, the API) points at the real frontend page. ``get_url`` is also
      overridden because the base implementation returns a *relative* path on
      single-site setups, which would resolve against the admin domain.
    """

    preview_modes: list = []

    def get_frontend_path(self):
        """Path of this page on the Next.js site, or None when it has no
        frontend equivalent (the page is then treated as not routable and
        "View live" is hidden)."""
        raise NotImplementedError

    def get_url_parts(self, request=None):
        path = self.get_frontend_path()
        if path is None:
            return None
        parts = super().get_url_parts(request=request)
        if parts is None:
            # Not under any Site root; still expose the frontend URL.
            return (None, settings.FRONTEND_URL, path)
        return (parts[0], settings.FRONTEND_URL, path)

    def get_url(self, request=None, current_site=None):
        return self.get_full_url(request=request)

    # Page defines ``url = property(get_url)``, binding the base function at
    # class-definition time — redeclare so the property dispatches to the
    # override above.
    @property
    def url(self):
        return self.get_url()


class ContentPageBase(FrontendPageMixin, Page):
    """Shared shape of tag/place pages: subtitle + StreamField body."""

    subtitle = models.CharField(max_length=255, blank=True, default="")
    body = StreamField(ContentStreamBlock(), blank=True)

    content_panels = Page.content_panels + [
        FieldPanel("subtitle"),
        FieldPanel("body"),
    ]

    search_fields = Page.search_fields + [
        index.SearchField("subtitle"),
        index.SearchField("body"),
    ]

    class Meta:
        abstract = True


class TagsIndexPage(FrontendPageMixin, Page):
    """Parent for all TagPages (one per locale).

    Provisioned by data migration (content/provision.py); ``max_count`` +
    ``parent_page_types`` lock the tree so partners cannot create duplicate
    index pages under Home. (Per-locale copies are created programmatically
    via ``copy_for_translation``, which does not consult ``max_count``.)
    """

    parent_page_types = ["wagtailcore.Page"]
    subpage_types = ["content.TagPage"]
    max_count = 1

    class Meta:
        verbose_name = "tags index page"

    def get_frontend_path(self):
        return "/portals"


class PlacesIndexPage(FrontendPageMixin, Page):
    """Parent for all PlacePages (one per locale). See TagsIndexPage on
    provisioning and tree locking."""

    parent_page_types = ["wagtailcore.Page"]
    subpage_types = ["content.PlacePage"]
    max_count = 1

    class Meta:
        verbose_name = "places index page"

    def get_frontend_path(self):
        return "/places"


class StaticIndexPage(FrontendPageMixin, Page):
    """Parent for all StaticPages (one per locale). See TagsIndexPage on
    provisioning and tree locking."""

    parent_page_types = ["wagtailcore.Page"]
    subpage_types = ["content.StaticPage"]
    max_count = 1

    class Meta:
        verbose_name = "static pages index"

    def get_frontend_path(self):
        # No frontend listing for static pages: not routable, no "View live".
        return None


class StaticPage(ContentPageBase):
    """A site static page (about, rules, contact, ...): subtitle + StreamField
    body, no map association. Served by the Next.js catch-all route via
    /api/content/static/slug/<slug>; a hardcoded Next.js route with the same
    path takes precedence, so pages can migrate into the CMS one at a time."""

    parent_page_types = ["content.StaticIndexPage"]
    subpage_types: list[str] = []

    class Meta:
        verbose_name = "static page"

    def get_frontend_path(self):
        return f"/{self.slug}"


class TagPage(ContentPageBase):
    """Replaces a cms.tags_content row (one page per slug+locale)."""

    districtr_map_slug = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Slug of the Districtr map module this tag page features.",
    )

    parent_page_types = ["content.TagsIndexPage"]
    subpage_types: list[str] = []

    content_panels = ContentPageBase.content_panels + [
        FieldPanel("districtr_map_slug"),
    ]

    # Team-scoped members only get to pick a map their teams own (content/forms.py).
    base_form_class = TagPageForm

    # The slug points at shared data, not prose — never send it to translators.
    override_translatable_fields = [SynchronizedField("districtr_map_slug")]

    class Meta:
        verbose_name = "tag page"

    def get_frontend_path(self):
        return f"/portal/{self.slug}"

    def clean(self):
        super().clean()
        if not self.districtr_map_slug:
            return
        # Validate against the datastore mirror when it is reachable. The
        # mirror is managed=False, so the table does not exist in test
        # databases — tolerate that instead of failing validation. The
        # savepoint keeps a failed query from aborting an outer transaction.
        from datastore.models import DistrictrMap

        try:
            with transaction.atomic():
                exists = DistrictrMap.objects.filter(
                    districtr_map_slug=self.districtr_map_slug
                ).exists()
        except DatabaseError:
            return
        if not exists:
            raise ValidationError(
                {
                    "districtr_map_slug": (
                        f"No Districtr map with slug {self.districtr_map_slug!r}."
                    )
                }
            )


class PlacePage(ContentPageBase):
    """Replaces a cms.places_content row (one page per slug+locale)."""

    districtr_map_slugs = ArrayField(
        models.CharField(max_length=255),
        blank=True,
        default=list,
        help_text="Slugs of the Districtr map modules this place page features.",
    )

    parent_page_types = ["content.PlacesIndexPage"]
    subpage_types: list[str] = []

    content_panels = ContentPageBase.content_panels + [
        FieldPanel("districtr_map_slugs"),
    ]

    # Team-scoped members only get to pick maps their teams own (content/forms.py).
    base_form_class = PlacePageForm

    override_translatable_fields = [SynchronizedField("districtr_map_slugs")]

    class Meta:
        verbose_name = "place page"

    def get_frontend_path(self):
        return f"/place/{self.slug}"
