"""
Wagtail page models replacing the legacy FastAPI CMS tables
(cms.tags_content / cms.places_content — see backend/app/cms/models.py).

Structure: two dedicated index pages (PortalsIndexPage at /tags/,
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

import uuid
from datetime import timedelta

from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.core.exceptions import ValidationError
from django.db import DatabaseError, ProgrammingError, models, transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver
from django.shortcuts import redirect
from django.utils import timezone
from wagtail.admin.panels import FieldPanel
from wagtail.fields import StreamField
from wagtail.models import Page
from wagtail.search import index
from wagtail_localize.fields import SynchronizedField

from content.blocks import ContentStreamBlock
from content.forms import PlacePageForm, PortalPageForm


class FrontendPageMixin:
    """Pages Wagtail never serves itself: the Next.js frontend renders them
    from the JSON API (content/api.py).

    - ``preview_modes = []`` disables the editor Preview panel and the "View
      draft" button; there is no Django template, so previewing raised
      TemplateDoesNotExist 500s. ContentPageBase re-enables it headlessly
      via snapshot + frontend redirect (serve_preview below).
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


class PreviewSnapshot(models.Model):
    """A draft page serialized exactly as the content API would serve it,
    parked for the frontend preview route. The row IS the capability: the
    unguessable pk is the whole grant (short TTL, pruned on write), so the
    fetch endpoint needs no auth."""

    TTL = timedelta(hours=1)

    token = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    data = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    @classmethod
    def fresh(cls):
        return cls.objects.filter(created_at__gte=timezone.now() - cls.TTL)

    @classmethod
    def prune(cls):
        cls.objects.filter(created_at__lt=timezone.now() - cls.TTL).delete()


class ContentPageBase(FrontendPageMixin, Page):
    """Shared shape of tag/place pages: subtitle + StreamField body."""

    subtitle = models.CharField(max_length=255, blank=True, default="")
    body = StreamField(ContentStreamBlock(), blank=True)

    # Content type key in the public API (content/api.py CONTENT_TYPE_PAGES).
    api_content_type: str

    # Re-enable the Preview panel / "View draft" button the mixin disables:
    # previews are headless too — serve_preview parks a serialized snapshot
    # and hands the editor's iframe/tab to the frontend, which fetches it
    # back by token (GET /api/content/preview/<token>).
    preview_modes = [("frontend", "Preview on site")]

    def serve_preview(self, request, mode_name):
        # Local import: content.api imports these models.
        from content.api import _serialize_page

        PreviewSnapshot.prune()
        snapshot = PreviewSnapshot.objects.create(
            data={
                "content": _serialize_page(self, self.api_content_type),
                "available_languages": [self.locale.language_code],
                "type": self.api_content_type,
            }
        )
        return redirect(f"{settings.FRONTEND_URL}/preview/{snapshot.token}")

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


class PortalsIndexPage(FrontendPageMixin, Page):
    """Parent for all PortalPages (one per locale).

    Provisioned by data migration (content/provision.py); ``max_count`` +
    ``parent_page_types`` lock the tree so partners cannot create duplicate
    index pages under Home. (Per-locale copies are created programmatically
    via ``copy_for_translation``, which does not consult ``max_count``.)
    """

    parent_page_types = ["wagtailcore.Page"]
    subpage_types = ["content.PortalPage"]
    max_count = 1

    class Meta:
        verbose_name = "portals index page"
        # Kept from TagsIndexPage: content/0002 provisions index pages with the
        # live models (treebeard can't build pages from historical ones), so on
        # a fresh database the live model must name the table 0002 sees.
        db_table = "content_tagsindexpage"

    def get_frontend_path(self):
        return "/portals"


class PlacesIndexPage(FrontendPageMixin, Page):
    """Parent for all PlacePages (one per locale). See PortalsIndexPage on
    provisioning and tree locking."""

    parent_page_types = ["wagtailcore.Page"]
    subpage_types = ["content.PlacePage"]
    max_count = 1

    class Meta:
        verbose_name = "places index page"

    def get_frontend_path(self):
        return "/places"


class StaticIndexPage(FrontendPageMixin, Page):
    """Parent for all StaticPages (one per locale). See PortalsIndexPage on
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

    api_content_type = "static"
    parent_page_types = ["content.StaticIndexPage"]
    subpage_types: list[str] = []

    class Meta:
        verbose_name = "static page"

    def get_frontend_path(self):
        return f"/{self.slug}"


class PortalPage(ContentPageBase):
    """Replaces a cms.tags_content row (one page per slug+locale)."""

    districtr_map_slug = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Slug of the Districtr map module this portal features.",
    )

    api_content_type = "portals"
    parent_page_types = ["content.PortalsIndexPage"]
    subpage_types: list[str] = []

    content_panels = ContentPageBase.content_panels + [
        FieldPanel("districtr_map_slug"),
    ]

    # Team-scoped members only get to pick a map their teams own (content/forms.py).
    base_form_class = PortalPageForm

    # These point at shared data, not prose, so translators never change them.
    # The slug is the portal's identity (FormConfig.portal_id); a translated
    # slug that drifted from its source could be claimed by another portal.
    override_translatable_fields = [
        SynchronizedField("districtr_map_slug"),
        SynchronizedField("slug", overridable=False),
    ]

    class Meta:
        verbose_name = "portal page"
        # Kept from TagPage for the same reason as PortalsIndexPage.db_table.
        db_table = "content_tagpage"

    def get_frontend_path(self):
        return f"/portal/{self.slug}"

    def permissions_for_user(self, user):
        from content.permissions import TeamScopedPagePermissionTester

        return TeamScopedPagePermissionTester(user, self)

    # The portal's FormConfig is keyed by the default-locale page slug
    # (FormConfig.portal_id), so renaming the page must carry the config along
    # or the submission form silently disappears. The backend FKs on
    # form_configs.portal_id are ON UPDATE CASCADE, so submissions, custom
    # questions and document ownership follow the config.

    def _stored_slug(self):
        if not self.pk:
            return None
        return (
            type(self).objects.filter(pk=self.pk).values_list("slug", flat=True).first()
        )

    def _owns_form_config_key(self):
        from wagtail.models import Locale

        return self.locale_id == Locale.get_default().id

    @property
    def portal_id(self):
        """This portal's identity: the default-locale translation's slug.

        Every locale resolves through translation_key, never its own slug, so
        a translation whose slug fell behind a rename still belongs to its
        portal and can't be matched to another portal that later takes the
        old slug. None for a translation with no default-locale source, which
        then belongs to no portal (fail closed).
        """
        if self._owns_form_config_key():
            return self.slug
        from wagtail.models import Locale

        return (
            PortalPage.objects.filter(
                translation_key=self.translation_key, locale=Locale.get_default()
            )
            .values_list("slug", flat=True)
            .first()
        )

    @staticmethod
    def _form_configs():
        """FormConfig mirror queryset, or None when the table is absent (the
        mirror is managed=False, so test databases may not have it). Only a
        missing table counts; any other database error propagates."""
        from datastore.models import FormConfig

        try:
            with transaction.atomic():
                FormConfig.objects.exists()
        except ProgrammingError as exc:
            if getattr(exc.__cause__, "sqlstate", None) == "42P01":  # undefined_table
                return None
            raise
        return FormConfig.objects

    def save(self, *args, **kwargs):
        # One transaction: the new slug and the FormConfig move commit
        # together, so a failure can't leave the page and its form split.
        with transaction.atomic():
            old_slug = self._stored_slug() if self._owns_form_config_key() else None
            super().save(*args, **kwargs)
            # Compare what's stored, not self.slug: draft saves keep a pending
            # slug in memory without writing it; only a publish changes the row.
            new_slug = self._stored_slug() if old_slug else None
            configs = (
                self._form_configs() if old_slug and new_slug != old_slug else None
            )
            if configs is not None:
                configs.filter(portal_id=old_slug).update(portal_id=new_slug)
            # Publish and unpublish both land here.
            self.sync_accepting(
                self._stored_slug() if self._owns_form_config_key() else self.portal_id
            )

    @staticmethod
    def portal_is_live(portal_id):
        """Whether any translation of the portal's default-locale page is
        live. That is what FormConfig.accepting mirrors: the backend refuses
        public submissions and listings for a closed portal."""
        from wagtail.models import Locale

        source = (
            PortalPage.objects.filter(slug=portal_id, locale=Locale.get_default())
            .values_list("translation_key", flat=True)
            .first()
        )
        return (
            source is not None
            and PortalPage.objects.filter(translation_key=source, live=True).exists()
        )

    @classmethod
    def sync_accepting(cls, portal_id):
        configs = cls._form_configs() if portal_id else None
        if configs is not None:
            configs.filter(portal_id=portal_id).update(
                accepting=cls.portal_is_live(portal_id)
            )

    def clean(self):
        super().clean()
        old_slug = self._stored_slug() if self._owns_form_config_key() else None
        if old_slug and self.slug != old_slug:
            configs = self._form_configs()
            if (
                configs is not None
                and configs.filter(portal_id=old_slug).exists()
                and configs.filter(portal_id=self.slug).exists()
            ):
                raise ValidationError(
                    {
                        "slug": (
                            f"Another portal form already uses {self.slug!r}, "
                            "so this portal's form can't move to it."
                        )
                    }
                )
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

    api_content_type = "places"
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

    def permissions_for_user(self, user):
        from content.permissions import TeamScopedPagePermissionTester

        return TeamScopedPagePermissionTester(user, self)


@receiver(post_delete, sender=PortalPage)
def _close_deleted_portal(sender, instance, **kwargs):
    # A deleted default-locale page closes its portal; a deleted translation
    # re-checks whether any translation is still live.
    PortalPage.sync_accepting(
        instance.slug if instance._owns_form_config_key() else instance.portal_id
    )


@receiver(post_save, sender=PortalsIndexPage)
@receiver(post_save, sender=PlacesIndexPage)
def _grant_partners_add_on_new_index(sender, instance, created, **kwargs):
    # Partners create pages under these indexes, including the per-locale
    # copies wagtail-localize makes on first translation. Every new index
    # gets the grant here, wherever it came from.
    if created:
        from content.provision import grant_partner_add

        grant_partner_add(instance)
