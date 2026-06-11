"""
Curated galleries of saved Districtr plans ("documents").

NEW capability (no legacy FastAPI equivalent): replicates the gallery
sections a power user (Redistricting Partners) built in his fork —
consultant drafts, public gallery, works in progress, COI gallery — where
partner staff curate lists of plans and editors/admins approve what goes
public.

Plans live in the FastAPI backend; a gallery entry references one by its
integer ``public_id`` only (no FK — the document tables are not mirrored in
datastore). The public API (galleries/api.py) serves the entry ids and the
Next.js PlanGallery component fetches the plan data itself.

Draft/published: Gallery is a full-featured snippet
(WorkflowMixin + DraftStateMixin + RevisionMixin — that exact MRO order is
enforced by Wagtail's system checks). Partners save drafts; editors/admins
publish (see galleries/migrations/0002 for the permission split). Only live
galleries are served by the public API.
"""

from django.contrib.contenttypes.fields import GenericRelation
from django.db import models
from modelcluster.fields import ParentalKey
from modelcluster.models import ClusterableModel
from wagtail.fields import RichTextField
from wagtail.models import DraftStateMixin, Orderable, RevisionMixin, WorkflowMixin
from wagtail.search import index

from content.blocks import RICH_TEXT_FEATURES


class GallerySection(models.TextChoices):
    CONSULTANT_DRAFTS = "consultant_drafts", "Consultant drafts"
    PUBLIC_GALLERY = "public_gallery", "Public gallery"
    WORKS_IN_PROGRESS = "works_in_progress", "Works in progress"
    COI_GALLERY = "coi_gallery", "COI gallery"


class GalleryVisibility(models.TextChoices):
    PUBLIC = "public", "Public"
    GROUP_ONLY = "group_only", "Group only"


class Gallery(
    WorkflowMixin,
    DraftStateMixin,
    RevisionMixin,
    index.Indexed,
    ClusterableModel,
):
    title = models.CharField(max_length=255)
    slug = models.SlugField(
        max_length=255,
        unique=True,
        help_text="Public identifier: served at /api/galleries/<slug>.",
    )
    section = models.CharField(
        max_length=32,
        choices=GallerySection.choices,
        default=GallerySection.PUBLIC_GALLERY,
    )
    # Group-scoping hook: which map group this gallery belongs to. Mirrors the
    # managed=False datastore pattern (db_constraint=False because Alembic owns
    # the map_group table; DO_NOTHING because Django must never cascade into
    # it). Not yet enforced by the API — see GalleryVisibility note below.
    map_group = models.ForeignKey(
        "datastore.MapGroup",
        on_delete=models.DO_NOTHING,
        db_constraint=False,
        null=True,
        blank=True,
        related_name="+",
        help_text="Optional map group this gallery is scoped to.",
    )
    # group_only galleries require a valid Districtr bearer token on the
    # public API; public ones are anonymous.
    visibility = models.CharField(
        max_length=16,
        choices=GalleryVisibility.choices,
        default=GalleryVisibility.PUBLIC,
    )
    description = RichTextField(blank=True, features=RICH_TEXT_FEATURES)

    # RevisionMixin: subclasses define the GenericRelation and surface it via
    # the `revisions` property (Wagtail snippet docs pattern).
    _revisions = GenericRelation("wagtailcore.Revision", related_query_name="gallery")

    # WorkflowMixin: required so workflow states can be queried per object.
    workflow_states = GenericRelation(
        "wagtailcore.WorkflowState",
        content_type_field="base_content_type",
        object_id_field="object_id",
        related_query_name="gallery",
        for_concrete_model=False,
    )

    search_fields = [
        index.SearchField("title"),
        index.AutocompleteField("title"),
        index.FilterField("section"),
    ]

    class Meta:
        verbose_name = "gallery"
        verbose_name_plural = "galleries"

    @property
    def revisions(self):
        return self._revisions

    def __str__(self):
        return self.title


class GalleryEntry(Orderable):
    """One curated plan in a gallery, referenced by its public id."""

    gallery = ParentalKey(
        Gallery,
        on_delete=models.CASCADE,
        related_name="entries",
    )
    document_public_id = models.PositiveIntegerField(
        help_text="Public id of the saved Districtr plan (document).",
    )
    caption = models.CharField(max_length=255, blank=True, default="")

    class Meta(Orderable.Meta):
        verbose_name = "gallery entry"
        verbose_name_plural = "gallery entries"

    def __str__(self):
        return f"plan {self.document_public_id}"
