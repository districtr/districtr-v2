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


def districtr_map_slug_choices(scoped=True):
    """Lazy ChoiceBlock feed from the managed=False mirror of districtrmap.

    ``scoped`` narrows to the current user's team modules when they're
    team-scoped — what the pickers offer. Validation uses the full set
    (scoped=False) so modules an admin placed survive a partner's save; the
    page forms enforce what a partner may add (content/forms.py).

    Imported inside the function to avoid app-loading-order issues and to
    keep database access strictly lazy (form render/validation only). The
    mirror table does not exist in test databases — degrade to no choices
    rather than 500ing the whole page editor (same tolerance as
    PortalPage.clean; the savepoint keeps a failed query from aborting an
    outer transaction).
    """
    from django.db import DatabaseError, transaction

    from authapi.teams import districtr_map_slugs_for_user, user_is_team_scoped
    from core.middleware import current_user
    from datastore.models import DistrictrMap

    user = current_user.get() if scoped else None
    try:
        with transaction.atomic():
            maps = DistrictrMap.objects.order_by("name")
            if user is not None and user_is_team_scoped(user):
                maps = maps.filter(
                    districtr_map_slug__in=districtr_map_slugs_for_user(user)
                )
            return [
                (slug, f"{name} ({slug})")
                for slug, name in maps.values_list("districtr_map_slug", "name")
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
        choices = dict(districtr_map_slug_choices(scoped=False))
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


# Matches the backend's cap on /api/documents/list?ids=.
MAX_CURATED_IDS = 50


def _gallery_display_blocks():
    """Presentation options shared by both gallery blocks (after each
    block's own source field, so that one comes first in the editor).

    Deliberately no per-field show/hide toggles: a gallery always paginates,
    offers grid and list views, and shows every field a map has a value for.
    Values saved by the retired toggles stay in storage but aren't served."""
    return [
        ("title", blocks.CharBlock(required=False)),
        ("description", blocks.TextBlock(required=False)),
        ("limit", blocks.IntegerBlock(default=12, label="Maps per page")),
    ]


class SubmissionsGalleryBlock(CompatStructBlock):
    """The page's portal's submitted maps at one status. Portal pages only
    (content/forms.py); the slug is injected when serving (content/api.py),
    so a rename can't strand the gallery. Stream name: plan_gallery."""

    def __init__(self, **kwargs):
        super().__init__(
            [
                (
                    "status",
                    blocks.ChoiceBlock(
                        choices=[
                            ("ready_to_share", "Finished maps"),
                            ("in_progress", "Maps in progress"),
                        ],
                        default="ready_to_share",
                        widget=forms.RadioSelect,
                        label="Show",
                    ),
                ),
                *_gallery_display_blocks(),
            ],
            **kwargs,
        )

    class Meta:
        icon = "table"
        label = "Submissions gallery"


class CuratedGalleryBlock(CompatStructBlock):
    """Specific maps, in the order entered. Works on any page."""

    def __init__(self, **kwargs):
        super().__init__(
            [
                (
                    "ids",
                    blocks.ListBlock(
                        blocks.IntegerBlock(min_value=1),
                        min_num=1,
                        max_num=MAX_CURATED_IDS,
                        label="Map IDs",
                        help_text=f"Up to {MAX_CURATED_IDS} public map IDs, "
                        "shown in this order.",
                    ),
                ),
                *_gallery_display_blocks(),
            ],
            **kwargs,
        )

    class Meta:
        icon = "table"
        label = "Curated gallery"


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
    limit = blocks.IntegerBlock(default=10, label="Entries per page")
    # The one behaviour choice; display is fixed like the map galleries'
    # (_gallery_display_blocks).
    showFilters = blocks.BooleanBlock(
        required=False,
        default=False,
        label="Show visitor filters",
        help_text="Search, place, state and zip filters above the gallery.",
    )

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
        help_text = (
            "Places the portal's submission form here. Which questions it "
            "asks is set in Portals → this portal → Edit form, not on the page."
        )
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
    plan_gallery = SubmissionsGalleryBlock()
    curated_gallery = CuratedGalleryBlock()
    comment_gallery = CommentGalleryBlock()
    form = FormBlock()
    map_create_buttons = MapCreateButtonsBlock()
