"""
StreamField block types mirroring the legacy TipTap (ProseMirror) custom
nodes used by the Next.js frontend.

CRITICAL CONTRACT: struct-child names keep the EXACT camelCase attribute
names defined in app/src/app/constants/cms.ts (PLAN_GALLERY_ATTRIBUTES,
COMMENT_GALLERY_ATTRIBUTES, FORM_ATTRIBUTES, MAP_CREATE_BUTTONS_ATTRIBUTES,
and the boilerplate/sectionHeader node attrs) so the frontend can spread a
block's ``value`` straight into the matching React component as props.

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

from wagtail import blocks

# The full set of marks/nodes the legacy editor could produce
# (app/src/app/components/RichTextRenderer/RichTextRenderer.tsx: StarterKit +
# Underline + TextStyle/Color + Link + Image). There is no Draftail feature
# for text color; converted color spans survive in the stored value but are
# dropped if the block is re-edited in the admin.
RICH_TEXT_FEATURES = [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "bold",
    "italic",
    "underline",
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
    keep database access strictly lazy (form render/validation only).
    """
    from datastore.models import DistrictrMap

    return [
        (slug, f"{name} ({slug})")
        for slug, name in DistrictrMap.objects.order_by("name").values_list(
            "districtr_map_slug", "name"
        )
    ]


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

    customContent = blocks.RichTextBlock(
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


class PlanGalleryBlock(CompatStructBlock):
    """TipTap ``planGalleryNode``; mirrors PLAN_GALLERY_ATTRIBUTES."""

    ids = blocks.ListBlock(
        blocks.IntegerBlock(),
        default=[],
        label="Plan IDs",
        help_text="Restrict the gallery to these plan IDs (empty = no filter).",
    )
    tags = blocks.ListBlock(
        blocks.CharBlock(),
        default=[],
        help_text="Restrict the gallery to plans with these tags (empty = no filter).",
    )
    title = blocks.CharBlock(required=False)
    description = blocks.TextBlock(required=False)
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
        help_text="Restrict the gallery to comments with these tags (empty = no filter).",
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


class FormBlock(blocks.StructBlock):
    """TipTap ``formNode`` (comment submission form); mirrors FORM_ATTRIBUTES."""

    mandatoryTags = blocks.ListBlock(
        blocks.CharBlock(),
        default=[],
        label="Mandatory tags",
        help_text="Tags automatically applied to every submission.",
    )
    allowListModules = blocks.ListBlock(
        blocks.ChoiceBlock(choices=districtr_map_slug_choices),
        default=[],
        label="Allow-listed modules",
        help_text="Districtr map modules submitters may attach (empty = all).",
    )

    class Meta:
        icon = "form"
        label = "Comment submission form"


class MapCreateButtonsViewBlock(blocks.StructBlock):
    """One entry of the ``views`` attr: Pick<DistrictrMap, 'name' | 'districtr_map_slug'>."""

    name = blocks.CharBlock(required=False)
    districtr_map_slug = blocks.ChoiceBlock(choices=districtr_map_slug_choices)

    class Meta:
        icon = "globe"
        label = "Map view"


class MapCreateButtonsBlock(blocks.StructBlock):
    """TipTap ``mapCreateButtonsNode``; mirrors MAP_CREATE_BUTTONS_ATTRIBUTES."""

    views = blocks.ListBlock(MapCreateButtonsViewBlock(), default=[])
    type = blocks.ChoiceBlock(
        choices=[("simple", "Simple"), ("megaphone", "Megaphone")],
        default="simple",
    )

    class Meta:
        icon = "plus"
        label = "Map create buttons"


class ContentStreamBlock(blocks.StreamBlock):
    """Top-level body stream for tag/place pages."""

    rich_text = blocks.RichTextBlock(features=RICH_TEXT_FEATURES, label="Rich text")
    boilerplate = BoilerplateBlock()
    section_header = SectionHeaderBlock()
    plan_gallery = PlanGalleryBlock()
    comment_gallery = CommentGalleryBlock()
    form = FormBlock()
    map_create_buttons = MapCreateButtonsBlock()
