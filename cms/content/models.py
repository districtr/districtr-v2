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

from django.contrib.postgres.fields import ArrayField
from django.core.exceptions import ValidationError
from django.db import DatabaseError, models, transaction
from wagtail.admin.panels import FieldPanel
from wagtail.fields import StreamField
from wagtail.models import Page
from wagtail.search import index
from wagtail_localize.fields import SynchronizedField

from content.blocks import ContentStreamBlock


class ContentPageBase(Page):
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


class TagsIndexPage(Page):
    """Parent for all TagPages (one per locale)."""

    subpage_types = ["content.TagPage"]

    class Meta:
        verbose_name = "tags index page"


class PlacesIndexPage(Page):
    """Parent for all PlacePages (one per locale)."""

    subpage_types = ["content.PlacePage"]

    class Meta:
        verbose_name = "places index page"


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

    # The slug points at shared data, not prose — never send it to translators.
    override_translatable_fields = [SynchronizedField("districtr_map_slug")]

    class Meta:
        verbose_name = "tag page"

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

    override_translatable_fields = [SynchronizedField("districtr_map_slugs")]

    class Meta:
        verbose_name = "place page"
