"""
StreamField block types mirroring the legacy TipTap (ProseMirror) custom
nodes used by the Next.js frontend.

CRITICAL CONTRACT: struct-child names keep the EXACT camelCase attribute
names defined in app/src/app/constants/cms.ts (PLAN_GALLERY_ATTRIBUTES,
COMMENT_GALLERY_ATTRIBUTES, MAP_CREATE_BUTTONS_ATTRIBUTES, and the
boilerplate/sectionHeader node attrs) so the frontend can spread a block's
``value`` straight into the matching React component as props. The form
block has no attribute list: its value is typed by FormBlock in
app/src/app/utils/api/cmsContent.ts and spread into SubmissionFormProps
(see the note in constants/cms.ts).

TipTap node name (app/src/app/components/Cms/RichTextEditor/extensions/)
maps to stream block name as follows:

    boilerplateNode      -> boilerplate
    sectionHeaderNode    -> section_header
    planGalleryNode      -> plan_gallery
    formNode             -> form
    mapCreateButtonsNode -> map_create_buttons
    commentGalleryNode   -> comment_gallery
    (runs of standard prose nodes) -> rich_text

Map-slug attrs use a ChoiceBlock fed lazily from the datastore mirror
(datastore.DistrictrMap). Choices are resolved at form render/validation
time only, so `manage.py check`/`makemigrations` never touch the database.
Caveat: a legacy slug that no longer exists in districtrmap will fail
ChoiceBlock validation if the block is *edited* in the admin (the stored
value itself is untouched until then).
"""

from django import forms
from django.core.exceptions import ValidationError
from django.utils.choices import CallableChoiceIterator
from wagtail import blocks
from wagtail.rich_text import expand_db_html

from datastore.widgets import MapModulePickerWidget

# The full set of marks/nodes the legacy editor could produce
# (app/src/app/components/RichTextRenderer/RichTextRenderer.tsx: StarterKit +
# Underline + TextStyle/Color + Link + Image). There is no Draftail feature
# for text color; converted color spans survive in the stored value but are
# dropped if the block is re-edited in the admin. "underline" is likewise NOT
# a registered Draftail feature in Wagtail 7 — listing it only raises a
# RuntimeWarning and renders no button, so it is omitted; converted <u> marks
# survive in stored values the same way color spans do.
RICH_TEXT_FEATURES = [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "bold",
    "italic",
    "strikethrough",
    "ol",
    "ul",
    "hr",
    "blockquote",
    "code",
    "link",
    "document-link",
    "image",
    "embed",
]


def districtr_map_slug_choices():
    """Lazy ChoiceBlock feed from the managed=False mirror of districtrmap.

    Imported inside the function to avoid app-loading-order issues and to
    keep database access strictly lazy (form render/validation only). The
    mirror table does not exist in test databases — degrade to no choices
    rather than 500ing the whole page editor (same tolerance as
    PortalPage.clean; the savepoint keeps a failed query from aborting an
    outer transaction).
    """
    from django.db import DatabaseError, transaction

    from datastore.models import DistrictrMap

    try:
        with transaction.atomic():
            return [
                (slug, f"{name} ({slug})")
                for slug, name in DistrictrMap.objects.order_by("name").values_list(
                    "districtr_map_slug", "name"
                )
            ]
    except DatabaseError:
        return []


def _list_items(value):
    """A plain list from either ListBlock storage ([{"type": "item",
    "value": v, "id": ...}], how these fields were saved before
    MapModulesBlock) or a plain list."""
    return [
        item["value"] if isinstance(item, dict) and item.get("type") == "item" else item
        for item in (value or [])
    ]


class MapModulesField(forms.Field):
    """Validates the picker's list against the districtrmap mirror.

    Plain: a list of slugs. ``labelled``: a list of {"name",
    "districtr_map_slug"} views, where a blank name falls back to the
    module's name.
    """

    def __init__(self, *, labelled=False, **kwargs):
        self.labelled = labelled
        super().__init__(
            widget=MapModulePickerWidget(
                multiple=True,
                ordered=True,
                labelled=("districtr_map_slug", "name") if labelled else None,
            ),
            **kwargs,
        )
        self.widget.choices = CallableChoiceIterator(districtr_map_slug_choices)

    def clean(self, value):
        items = list(value or [])
        if self.required and not items:
            raise ValidationError(self.error_messages["required"], code="required")
        if not self.labelled:
            items = [{"districtr_map_slug": str(slug), "name": ""} for slug in items]
        choices = dict(districtr_map_slug_choices())
        views, seen = [], set()
        for item in items:
            slug = item.get("districtr_map_slug") if isinstance(item, dict) else None
            if slug not in choices:
                raise ValidationError(f"{slug!r} is not a known map module.")
            if slug in seen:
                continue
            seen.add(slug)
            # Choice labels are "Name (slug)"; the bare name is the default.
            default_name = choices[slug].removesuffix(f" ({slug})")
            name = str(item.get("name") or "").strip() or default_name
            views.append({"name": name, "districtr_map_slug": slug})
        return views if self.labelled else [v["districtr_map_slug"] for v in views]


class MapModulesBlock(blocks.FieldBlock):
    """An ordered list of map modules picked in one filterable table
    (datastore/widgets.py) — replaces a ListBlock of one-module rows.

    Reads the old ListBlock storage as well as its own plain list, so pages
    saved before the switch keep their modules.
    """

    def __init__(self, labelled=False, required=False, help_text=None, **kwargs):
        self.field = MapModulesField(
            labelled=labelled, required=required, help_text=help_text
        )
        super().__init__(**kwargs)

    def get_default(self):
        return []

    def to_python(self, value):
        return _list_items(value)

    def get_prep_value(self, value):
        return list(value or [])

    def get_api_representation(self, value, context=None):
        return list(value or [])

    def get_searchable_content(self, value):
        return []

    class Meta:
        default = []


class FrontendRichTextBlock(blocks.RichTextBlock):
    """RichTextBlock whose API representation is frontend-ready HTML.

    The base block serves the raw database HTML, in which internal links and
    images are contracted references (``<a linktype="page" id="3">``,
    ``<embed embedtype="image" .../>``) that the Next.js frontend cannot
    resolve. expand_db_html rewrites them into real ``href``/``<img>`` markup,
    exactly as Wagtail template rendering would.
    """

    def get_api_representation(self, value, context=None):
        html = super().get_api_representation(value, context=context)
        return expand_db_html(html) if html else html


class CompatStructBlock(blocks.StructBlock):
    """StructBlock whose API representation can null-out empty filter attrs.

    The legacy TipTap attrs defaulted to ``null`` ("no filter"); StreamField
    stores ``[]``/``""`` instead. For attrs listed in
    ``meta.nullable_if_empty`` the public API serves ``null`` again so the
    React components keep their "unfiltered" behaviour.
    """

    def get_api_representation(self, value, context=None):
        result = super().get_api_representation(value, context=context)
        for name in getattr(self.meta, "nullable_if_empty", ()):
            if not result.get(name):
                result[name] = None
        return result


class BoilerplateBlock(blocks.StructBlock):
    """TipTap ``boilerplateNode``: nests a ProseMirror doc under the
    ``customContent`` attr (rendered after the static About-the-data copy)."""

    customContent = FrontendRichTextBlock(
        required=False,
        features=RICH_TEXT_FEATURES,
        label="Custom content",
        help_text="Optional extra prose appended to the boilerplate.",
    )

    class Meta:
        icon = "doc-full"
        label = "Boilerplate (About the data)"


class SectionHeaderBlock(blocks.StructBlock):
    """TipTap ``sectionHeaderNode``: a single ``title`` attr."""

    title = blocks.CharBlock(required=False)

    class Meta:
        icon = "title"
        label = "Section header"


# What a plan gallery lists. Resolved into the served ids/tags filters by
# content/api.py::_resolve_plan_galleries.
PLAN_GALLERY_SOURCES = [
    ("this_portal", "This portal's submissions"),
    ("ids", "Specific maps (by ID)"),
    ("portals", "Submissions to other portals"),
    ("all", "Shared maps from the whole site"),
]


def plan_gallery_source(value):
    """The gallery's source, inferred for blocks saved before ``source``
    existed: curated ids won, then portal slugs, then the old thisPortal
    checkbox (default on), else site-wide."""
    if value.get("source"):
        return value["source"]
    if value.get("ids"):
        return "ids"
    if value.get("tags"):
        return "portals"
    return "this_portal" if value.get("thisPortal", True) else "all"


class PlanGalleryBlock(CompatStructBlock):
    """TipTap ``planGalleryNode``; mirrors PLAN_GALLERY_ATTRIBUTES.

    ``source`` picks what the gallery lists: this portal's submissions (the
    slug is injected when serving, so a rename can't strand it), a curated
    list of map IDs in editor order, other portals' submissions, or the
    whole site. A page may carry any number of galleries.
    """

    source = blocks.ChoiceBlock(
        choices=PLAN_GALLERY_SOURCES,
        default="this_portal",
        widget=forms.RadioSelect,
        label="Show",
        help_text='"This portal" only applies on portal pages. Listing the '
        "whole site or other portals is admin-only.",
    )
    ids = blocks.ListBlock(
        blocks.IntegerBlock(min_value=1),
        default=[],
        label="Map IDs",
        help_text='For "Specific maps": public map IDs, shown in this order.',
    )
    tags = blocks.ListBlock(
        blocks.CharBlock(),
        default=[],
        label="Portal slugs",
        help_text='For "Submissions to other portals": the portals to list.',
    )
    title = blocks.CharBlock(required=False)
    description = blocks.TextBlock(required=False)
    includeInProgress = blocks.BooleanBlock(
        required=False,
        default=False,
        label="Include in-progress plans",
        help_text="Filtered galleries show ready-to-share plans only unless "
        "this is ticked.",
    )
    paginate = blocks.BooleanBlock(required=False, default=True)
    showListView = blocks.BooleanBlock(required=False, default=True)
    showThumbnails = blocks.BooleanBlock(required=False, default=True)
    showTitles = blocks.BooleanBlock(required=False, default=True)
    showDescriptions = blocks.BooleanBlock(required=False, default=True)
    showUpdatedAt = blocks.BooleanBlock(required=False, default=True)
    showTags = blocks.BooleanBlock(required=False, default=True)
    showModule = blocks.BooleanBlock(required=False, default=True)
    limit = blocks.IntegerBlock(default=12)

    class Meta:
        icon = "table"
        label = "Plan gallery"
        nullable_if_empty = ("ids", "tags")

    def _with_source(self, value):
        return {**value, "source": plan_gallery_source(value)}

    def to_python(self, value):
        return super().to_python(self._with_source(value))

    def bulk_to_python(self, values):
        return super().bulk_to_python([self._with_source(v) for v in values])

    def clean(self, value):
        value = super().clean(value)
        required = {"ids": "Add at least one map ID.", "portals": "Add a portal slug."}
        field = {"ids": "ids", "portals": "tags"}.get(value["source"])
        if field and not value[field]:
            raise blocks.StructBlockValidationError(
                block_errors={field: ValidationError(required[value["source"]])}
            )
        return value


class CommentGalleryBlock(CompatStructBlock):
    """TipTap ``commentGalleryNode``; mirrors COMMENT_GALLERY_ATTRIBUTES."""

    title = blocks.CharBlock(required=False)
    description = blocks.TextBlock(required=False)
    ids = blocks.ListBlock(
        blocks.IntegerBlock(),
        default=[],
        label="Comment IDs",
        help_text="Restrict the gallery to these comment IDs (empty = no filter).",
    )
    tags = blocks.ListBlock(
        blocks.CharBlock(),
        default=[],
        help_text="Portal slugs whose submissions to list. A portal page's "
        "gallery always lists that portal's submissions.",
    )
    place = blocks.CharBlock(required=False)
    state = blocks.CharBlock(required=False)
    zipCode = blocks.CharBlock(required=False, label="Zip code")
    limit = blocks.IntegerBlock(default=10)
    showIdentifier = blocks.BooleanBlock(required=False, default=True)
    showTitles = blocks.BooleanBlock(required=False, default=True)
    showPlaces = blocks.BooleanBlock(required=False, default=True)
    showStates = blocks.BooleanBlock(required=False, default=True)
    showZipCodes = blocks.BooleanBlock(required=False, default=True)
    showCreatedAt = blocks.BooleanBlock(required=False, default=True)
    showListView = blocks.BooleanBlock(required=False, default=True)
    paginate = blocks.BooleanBlock(required=False, default=True)
    showFilters = blocks.BooleanBlock(required=False, default=False)
    showMaps = blocks.BooleanBlock(required=False, default=True)

    class Meta:
        icon = "group"
        label = "Comment gallery"
        nullable_if_empty = ("ids", "tags", "place", "state", "zipCode")


class FormBlock(CompatStructBlock):
    """The submission-form placement marker; its value is FormBlock in
    app/src/app/utils/api/cmsContent.ts.

    Which fields the form shows lives portal-level in the FormConfig mirror
    (datastore.models.FormConfig), injected into the API representation by
    content/api.py::_inject_form_config — the block itself only carries the
    placement-specific knobs. nullable_if_empty on allowListModules restores
    the "empty = all" contract: served as ``[]`` the frontend's
    ``allowListModules.includes(slug)`` rejects every module.
    """

    allowListModules = MapModulesBlock(
        label="Allow-listed modules",
        help_text="Districtr map modules submitters may attach (none = all).",
    )

    class Meta:
        icon = "form"
        label = "Submission form"
        nullable_if_empty = ("allowListModules",)


class MapCreateButtonsBlock(blocks.StructBlock):
    """TipTap ``mapCreateButtonsNode``; mirrors MAP_CREATE_BUTTONS_ATTRIBUTES."""

    # Each view is Pick<DistrictrMap, 'name' | 'districtr_map_slug'>; the
    # name is the button label.
    views = MapModulesBlock(
        labelled=True,
        label="Map modules",
        help_text="One button per module, in this order. Type a label to "
        "rename a button (blank = the module's name).",
    )
    type = blocks.ChoiceBlock(
        choices=[("simple", "Simple"), ("megaphone", "Megaphone"), ("cards", "Cards")],
        default="simple",
    )

    class Meta:
        icon = "plus"
        label = "Map create buttons"


class ContentStreamBlock(blocks.StreamBlock):
    """Top-level body stream for tag/place pages."""

    rich_text = FrontendRichTextBlock(features=RICH_TEXT_FEATURES, label="Rich text")
    boilerplate = BoilerplateBlock()
    section_header = SectionHeaderBlock()
    plan_gallery = PlanGalleryBlock()
    comment_gallery = CommentGalleryBlock()
    form = FormBlock()
    map_create_buttons = MapCreateButtonsBlock()
