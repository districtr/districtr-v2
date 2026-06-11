"""
Tests for the legacy-CMS replacement: the TipTap -> StreamField converter,
the public compat API, and the migrate_tiptap management command.

The command tests read cms.tags_content/cms.places_content via raw SQL.
The Django test database does not have the legacy `cms` schema, so setUp
creates it (and minimal tables matching the real columns the command reads)
inside the per-test transaction; the rollback drops it again.
"""

import io
import json
import uuid

from django.core.management import call_command as django_call_command
from django.core.management.base import CommandError
from django.db import connection
from django.test import SimpleTestCase, TestCase
from wagtail.models import Locale, Page, Revision, Site

from content.models import PlacePage, PlacesIndexPage, TagPage, TagsIndexPage
from content.tiptap import (
    extract_prosemirror_text,
    extract_stream_text,
    prosemirror_to_html,
    tiptap_to_stream_data,
)

# ---------------------------------------------------------------------------
# ProseMirror doc builders (exact TipTap node/attr names)
# ---------------------------------------------------------------------------


def text(value, *marks):
    node = {"type": "text", "text": value}
    if marks:
        node["marks"] = list(marks)
    return node


def paragraph(*children):
    return {"type": "paragraph", "content": list(children)}


def doc(*children):
    return {"type": "doc", "content": list(children)}


PLAN_GALLERY_ATTRS = {
    "ids": [1, 2],
    "tags": ["fair-maps"],
    "title": "Featured plans",
    "description": "A few of our favorites",
    "paginate": False,
    "showListView": True,
    "showThumbnails": True,
    "showTitles": False,
    "showDescriptions": True,
    "showUpdatedAt": True,
    "showTags": True,
    "showModule": False,
    "limit": 6,
}

COMMENT_GALLERY_ATTRS = {
    "title": "What people said",
    "description": None,
    "ids": None,
    "tags": ["chicago"],
    "place": "Chicago",
    "state": "IL",
    "zipCode": "60637",
    "limit": 5,
    "showIdentifier": True,
    "showTitles": True,
    "showPlaces": False,
    "showStates": True,
    "showZipCodes": True,
    "showCreatedAt": False,
    "showListView": True,
    "paginate": True,
    "showFilters": False,
    "showMaps": True,
}

FORM_ATTRS = {
    "mandatoryTags": ["chicago", "ward-map"],
    "allowListModules": ["chi_wards"],
}

MAP_CREATE_BUTTONS_ATTRS = {
    "views": [{"name": "Chicago Wards", "districtr_map_slug": "chi_wards"}],
    "type": "megaphone",
}


class ProsemirrorToHtmlTests(SimpleTestCase):
    """Every standard node/mark type the legacy editor could produce
    (RichTextRenderer.tsx: StarterKit + Underline + TextStyle/Color + Link +
    Image)."""

    def test_paragraph_and_marks(self):
        html = prosemirror_to_html(
            doc(
                paragraph(
                    text("plain "),
                    text("bold", {"type": "bold"}),
                    text(" italic", {"type": "italic"}),
                    text(" under", {"type": "underline"}),
                    text(" struck", {"type": "strike"}),
                    text(" mono", {"type": "code"}),
                    text(
                        " red",
                        {"type": "textStyle", "attrs": {"color": "#ff0000"}},
                    ),
                    text(
                        " linked",
                        {"type": "link", "attrs": {"href": "https://districtr.org"}},
                    ),
                )
            )
        )
        self.assertEqual(
            html,
            "<p>plain <b>bold</b><i> italic</i><u> under</u><s> struck</s>"
            "<code> mono</code>"
            '<span style="color: #ff0000"> red</span>'
            '<a href="https://districtr.org"> linked</a></p>',
        )

    def test_nested_marks_wrap_outside_in(self):
        html = prosemirror_to_html(
            doc(paragraph(text("both", {"type": "bold"}, {"type": "italic"})))
        )
        self.assertEqual(html, "<p><b><i>both</i></b></p>")

    def test_headings_all_levels(self):
        for level in range(1, 7):
            html = prosemirror_to_html(
                doc(
                    {
                        "type": "heading",
                        "attrs": {"level": level},
                        "content": [text("T")],
                    }
                )
            )
            self.assertEqual(html, f"<h{level}>T</h{level}>")

    def test_lists(self):
        html = prosemirror_to_html(
            doc(
                {
                    "type": "bulletList",
                    "content": [
                        {"type": "listItem", "content": [paragraph(text("a"))]},
                        {"type": "listItem", "content": [paragraph(text("b"))]},
                    ],
                },
                {
                    "type": "orderedList",
                    "attrs": {"start": 3},
                    "content": [
                        {"type": "listItem", "content": [paragraph(text("c"))]}
                    ],
                },
            )
        )
        self.assertEqual(
            html,
            "<ul><li><p>a</p></li><li><p>b</p></li></ul>"
            '<ol start="3"><li><p>c</p></li></ol>',
        )

    def test_blockquote_codeblock_breaks_and_rule(self):
        html = prosemirror_to_html(
            doc(
                {"type": "blockquote", "content": [paragraph(text("quoted"))]},
                {"type": "codeBlock", "content": [text("x = 1")]},
                paragraph(text("line"), {"type": "hardBreak"}, text("break")),
                {"type": "horizontalRule"},
            )
        )
        self.assertEqual(
            html,
            "<blockquote><p>quoted</p></blockquote>"
            "<pre><code>x = 1</code></pre>"
            "<p>line<br>break</p><hr>",
        )

    def test_image(self):
        html = prosemirror_to_html(
            doc(
                {
                    "type": "image",
                    "attrs": {
                        "src": "https://example.com/a.png",
                        "alt": "A map",
                        "title": "Map",
                    },
                }
            )
        )
        self.assertEqual(
            html,
            '<img src="https://example.com/a.png" alt="A map" title="Map">',
        )

    def test_text_is_escaped(self):
        html = prosemirror_to_html(doc(paragraph(text('<b> & "quotes"'))))
        self.assertEqual(html, "<p>&lt;b&gt; &amp; &quot;quotes&quot;</p>")

    def test_unknown_node_degrades_to_text_with_warning(self):
        warnings = []
        html = prosemirror_to_html(
            doc({"type": "mystery", "content": [text("kept")]}), warnings
        )
        self.assertEqual(html, "kept")
        self.assertEqual(len(warnings), 1)
        self.assertIn("mystery", warnings[0])


class TiptapToStreamDataTests(SimpleTestCase):
    """Custom nodes (exact TipTap names + camelCase attrs) and run collapsing."""

    def test_prose_runs_collapse_around_custom_nodes(self):
        result = tiptap_to_stream_data(
            doc(
                paragraph(text("first")),
                {"type": "heading", "attrs": {"level": 2}, "content": [text("head")]},
                {"type": "planGalleryNode", "attrs": dict(PLAN_GALLERY_ATTRS)},
                paragraph(text("after")),
            )
        )
        self.assertEqual(
            [block["type"] for block in result.stream_data],
            ["rich_text", "plan_gallery", "rich_text"],
        )
        self.assertEqual(result.stream_data[0]["value"], "<p>first</p><h2>head</h2>")
        self.assertEqual(result.stream_data[2]["value"], "<p>after</p>")

    def test_plan_gallery_attrs_copied_verbatim(self):
        result = tiptap_to_stream_data(
            doc({"type": "planGalleryNode", "attrs": dict(PLAN_GALLERY_ATTRS)})
        )
        self.assertEqual(result.stream_data[0]["value"], PLAN_GALLERY_ATTRS)

    def test_plan_gallery_null_attrs_use_block_defaults(self):
        result = tiptap_to_stream_data(
            doc(
                {
                    "type": "planGalleryNode",
                    "attrs": {key: None for key in PLAN_GALLERY_ATTRS},
                }
            )
        )
        value = result.stream_data[0]["value"]
        self.assertEqual(value["ids"], [])
        self.assertEqual(value["tags"], [])
        self.assertTrue(value["paginate"])
        self.assertEqual(value["limit"], 12)

    def test_comment_gallery_attrs(self):
        result = tiptap_to_stream_data(
            doc({"type": "commentGalleryNode", "attrs": dict(COMMENT_GALLERY_ATTRS)})
        )
        value = result.stream_data[0]["value"]
        self.assertEqual(result.stream_data[0]["type"], "comment_gallery")
        self.assertEqual(value["zipCode"], "60637")
        self.assertEqual(value["ids"], [])  # null -> empty list in storage
        self.assertEqual(value["tags"], ["chicago"])
        self.assertFalse(value["showCreatedAt"])

    def test_form_node(self):
        result = tiptap_to_stream_data(
            doc({"type": "formNode", "attrs": dict(FORM_ATTRS)})
        )
        self.assertEqual(result.stream_data[0], {"type": "form", "value": FORM_ATTRS})

    def test_map_create_buttons_node(self):
        result = tiptap_to_stream_data(
            doc(
                {
                    "type": "mapCreateButtonsNode",
                    "attrs": dict(MAP_CREATE_BUTTONS_ATTRS),
                }
            )
        )
        self.assertEqual(
            result.stream_data[0],
            {"type": "map_create_buttons", "value": MAP_CREATE_BUTTONS_ATTRS},
        )

    def test_section_header_node(self):
        result = tiptap_to_stream_data(
            doc({"type": "sectionHeaderNode", "attrs": {"title": "Overview"}})
        )
        self.assertEqual(
            result.stream_data[0],
            {"type": "section_header", "value": {"title": "Overview"}},
        )

    def test_boilerplate_nested_doc_becomes_rich_text(self):
        result = tiptap_to_stream_data(
            doc(
                {
                    "type": "boilerplateNode",
                    "attrs": {
                        "customContent": doc(
                            paragraph(text("extra ", {"type": "bold"}), text("notes"))
                        )
                    },
                }
            )
        )
        self.assertEqual(
            result.stream_data[0],
            {
                "type": "boilerplate",
                "value": {"customContent": "<p><b>extra </b>notes</p>"},
            },
        )

    def test_boilerplate_null_custom_content(self):
        result = tiptap_to_stream_data(
            doc({"type": "boilerplateNode", "attrs": {"customContent": None}})
        )
        self.assertEqual(
            result.stream_data[0],
            {"type": "boilerplate", "value": {"customContent": ""}},
        )

    def test_inline_content_inside_custom_node_is_flagged(self):
        result = tiptap_to_stream_data(
            doc({"type": "planGalleryNode", "attrs": {}, "content": [text("stray")]})
        )
        self.assertTrue(any("planGalleryNode" in w for w in result.warnings))

    def test_text_fidelity_roundtrip(self):
        source = doc(
            paragraph(text("Hello & <world>")),
            {"type": "sectionHeaderNode", "attrs": {"title": "T"}},
            {
                "type": "boilerplateNode",
                "attrs": {"customContent": doc(paragraph(text("nested text")))},
            },
            paragraph(text("bye", {"type": "bold"})),
        )
        result = tiptap_to_stream_data(source)
        self.assertEqual(
            extract_prosemirror_text(source), extract_stream_text(result.stream_data)
        )

    def test_converted_data_loads_as_stream_value(self):
        """The raw output must round-trip through the actual StreamField block."""
        from content.blocks import ContentStreamBlock

        source = doc(
            paragraph(text("prose")),
            {"type": "planGalleryNode", "attrs": dict(PLAN_GALLERY_ATTRS)},
            {"type": "mapCreateButtonsNode", "attrs": dict(MAP_CREATE_BUTTONS_ATTRS)},
        )
        stream_value = ContentStreamBlock().to_python(
            tiptap_to_stream_data(source).stream_data
        )
        self.assertEqual(
            [child.block_type for child in stream_value],
            ["rich_text", "plan_gallery", "map_create_buttons"],
        )
        self.assertEqual(list(stream_value[1].value["ids"]), [1, 2])
        self.assertEqual(
            stream_value[2].value["views"][0]["districtr_map_slug"], "chi_wards"
        )


# ---------------------------------------------------------------------------
# Public compat API
# ---------------------------------------------------------------------------


class ContentApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        home = Site.objects.get(is_default_site=True).root_page
        cls.en = Locale.objects.get(language_code="en")
        cls.es = Locale.objects.create(language_code="es")

        cls.tags_index = TagsIndexPage(title="Tags", slug="tags")
        home.add_child(instance=cls.tags_index)
        cls.places_index = PlacesIndexPage(title="Places", slug="places")
        home.add_child(instance=cls.places_index)

        cls.tag_en = TagPage(
            title="Fair Maps",
            slug="fair-maps",
            subtitle="A tag",
            districtr_map_slug="chi_wards",
            body=[
                {"type": "rich_text", "value": "<p>English prose</p>"},
                {
                    "type": "plan_gallery",
                    "value": {
                        "ids": [],
                        "tags": [],
                        "title": "Gallery",
                        "description": "",
                        "paginate": True,
                        "showListView": True,
                        "showThumbnails": True,
                        "showTitles": True,
                        "showDescriptions": True,
                        "showUpdatedAt": True,
                        "showTags": True,
                        "showModule": True,
                        "limit": 12,
                    },
                },
            ],
        )
        cls.tags_index.add_child(instance=cls.tag_en)
        cls.tag_en.save_revision(clean=False).publish()

        cls.tag_es = cls.tag_en.copy_for_translation(cls.es, copy_parents=True)
        cls.tag_es.title = "Mapas Justos"
        cls.tag_es.body = [{"type": "rich_text", "value": "<p>Prosa en español</p>"}]
        cls.tag_es.save_revision(clean=False).publish()

        draft_only = TagPage(title="Draft Tag", slug="draft-tag", live=False)
        cls.tags_index.add_child(instance=draft_only)
        draft_only.save_revision(clean=False)

        place = PlacePage(
            title="Chicago",
            slug="chicago",
            districtr_map_slugs=["chi_wards", "chi_blocks"],
            body=[{"type": "rich_text", "value": "<p>Chicago place page</p>"}],
        )
        cls.places_index.add_child(instance=place)
        place.save_revision(clean=False).publish()

    def test_detail_serves_requested_language(self):
        response = self.client.get("/api/content/tags/slug/fair-maps?language=es")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Access-Control-Allow-Origin"], "*")
        payload = response.json()
        self.assertEqual(payload["type"], "tags")
        self.assertEqual(payload["available_languages"], ["en", "es"])
        self.assertEqual(payload["content"]["language"], "es")
        self.assertEqual(payload["content"]["title"], "Mapas Justos")
        self.assertEqual(payload["content"]["slug"], "fair-maps")

    def test_detail_falls_back_to_english(self):
        response = self.client.get("/api/content/tags/slug/fair-maps?language=zh")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["content"]["language"], "en")
        self.assertEqual(payload["available_languages"], ["en", "es"])

    def test_detail_body_shape_and_null_compat(self):
        payload = self.client.get("/api/content/tags/slug/fair-maps").json()
        content = payload["content"]
        self.assertEqual(content["districtr_map_slug"], "chi_wards")
        body = content["body"]
        self.assertEqual(
            [block["type"] for block in body], ["rich_text", "plan_gallery"]
        )
        self.assertEqual(body[0]["value"], "<p>English prose</p>")
        gallery = body[1]["value"]
        # Empty list filters are served as null, matching the legacy attrs.
        self.assertIsNone(gallery["ids"])
        self.assertIsNone(gallery["tags"])
        self.assertEqual(gallery["limit"], 12)
        self.assertTrue(gallery["showListView"])

    def test_detail_places_shape(self):
        payload = self.client.get("/api/content/places/slug/chicago").json()
        self.assertEqual(payload["type"], "places")
        self.assertEqual(
            payload["content"]["districtr_map_slugs"], ["chi_wards", "chi_blocks"]
        )

    def test_detail_unknown_slug_404(self):
        response = self.client.get("/api/content/tags/slug/missing")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response["Access-Control-Allow-Origin"], "*")

    def test_detail_draft_only_page_404(self):
        response = self.client.get("/api/content/tags/slug/draft-tag")
        self.assertEqual(response.status_code, 404)

    def test_detail_unknown_type_404(self):
        response = self.client.get("/api/content/nope/slug/fair-maps")
        self.assertEqual(response.status_code, 404)

    def test_list_endpoint(self):
        response = self.client.get("/api/content/tags/list")
        self.assertEqual(response.status_code, 200)
        rows = response.json()
        self.assertEqual(
            rows,
            [
                {
                    "slug": "fair-maps",
                    "title": "Fair Maps",
                    "language": "en",
                    "districtr_map_slug": "chi_wards",
                },
                {
                    "slug": "fair-maps",
                    "title": "Mapas Justos",
                    "language": "es",
                    "districtr_map_slug": "chi_wards",
                },
            ],
        )

    def test_list_language_filter(self):
        rows = self.client.get("/api/content/tags/list?language=es").json()
        self.assertEqual(
            rows,
            [
                {
                    "slug": "fair-maps",
                    "title": "Mapas Justos",
                    "language": "es",
                    "districtr_map_slug": "chi_wards",
                }
            ],
        )

    def test_list_places_includes_map_slugs(self):
        rows = self.client.get("/api/content/places/list").json()
        self.assertEqual(
            [r["districtr_map_slugs"] for r in rows if r["slug"] == "chicago"],
            [["chi_wards", "chi_blocks"]],
        )


# ---------------------------------------------------------------------------
# migrate_tiptap command
# ---------------------------------------------------------------------------


def call_command(*args, **kwargs):
    """call_command with captured output to keep test runs quiet."""
    kwargs.setdefault("stdout", io.StringIO())
    kwargs.setdefault("stderr", io.StringIO())
    return django_call_command(*args, **kwargs)


LEGACY_TAGS_DDL = """
    CREATE TABLE cms.tags_content (
        id uuid PRIMARY KEY,
        slug varchar NOT NULL,
        language varchar NOT NULL,
        draft_content jsonb,
        published_content jsonb,
        districtr_map_slug varchar,
        author varchar,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (slug, language)
    )
"""

LEGACY_PLACES_DDL = """
    CREATE TABLE cms.places_content (
        id uuid PRIMARY KEY,
        slug varchar NOT NULL,
        language varchar NOT NULL,
        draft_content jsonb,
        published_content jsonb,
        districtr_map_slugs varchar[],
        author varchar,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (slug, language)
    )
"""


class MigrateTiptapCommandTests(TestCase):
    def setUp(self):
        with connection.cursor() as cursor:
            cursor.execute("CREATE SCHEMA IF NOT EXISTS cms")
            cursor.execute(LEGACY_TAGS_DDL)
            cursor.execute(LEGACY_PLACES_DDL)

    def _insert(self, table, slug, language, published=None, draft=None, **extra):
        columns = ["id", "slug", "language", "published_content", "draft_content"]
        values = [
            str(uuid.uuid4()),
            slug,
            language,
            json.dumps(published) if published is not None else None,
            json.dumps(draft) if draft is not None else None,
        ]
        placeholders = ["%s", "%s", "%s", "%s::jsonb", "%s::jsonb"]
        for column, value in extra.items():
            columns.append(column)
            values.append(value)
            placeholders.append("%s")
        with connection.cursor() as cursor:
            cursor.execute(
                f"INSERT INTO cms.{table} ({', '.join(columns)}) "
                f"VALUES ({', '.join(placeholders)})",
                values,
            )

    def _seed_fixtures(self):
        published_en = doc(
            {"type": "sectionHeaderNode", "attrs": {"title": "Fair Maps"}},
            paragraph(text("Published English prose")),
            {"type": "planGalleryNode", "attrs": dict(PLAN_GALLERY_ATTRS)},
        )
        draft_en = doc(
            {"type": "sectionHeaderNode", "attrs": {"title": "Fair Maps"}},
            paragraph(text("Newer draft prose")),
        )
        published_es = doc(
            {"type": "sectionHeaderNode", "attrs": {"title": "Mapas Justos"}},
            paragraph(text("Prosa publicada en español")),
        )
        self._insert(
            "tags_content",
            "fair-maps",
            "en",
            published=published_en,
            draft=draft_en,
            districtr_map_slug="chi_wards",
        )
        self._insert("tags_content", "fair-maps", "es", published=published_es)
        # Draft-only row: must produce an unpublished page.
        self._insert(
            "tags_content",
            "draft-tag",
            "en",
            draft=doc(paragraph(text("not yet published"))),
        )
        self._insert(
            "places_content",
            "chicago",
            "en",
            published=doc(paragraph(text("Chicago place"))),
            districtr_map_slugs=["chi_wards", "chi_blocks"],
        )

    def test_command_creates_pages_translations_and_revisions(self):
        self._seed_fixtures()
        call_command("migrate_tiptap")

        tag_en = TagPage.objects.get(slug="fair-maps", locale__language_code="en")
        tag_es = TagPage.objects.get(slug="fair-maps", locale__language_code="es")
        self.assertTrue(tag_en.live)
        self.assertTrue(tag_es.live)
        # Title derived from the first sectionHeaderNode.
        self.assertEqual(tag_en.title, "Fair Maps")
        self.assertEqual(tag_es.title, "Mapas Justos")
        # Real Wagtail translations: shared translation_key.
        self.assertEqual(tag_en.translation_key, tag_es.translation_key)
        self.assertEqual(tag_en.districtr_map_slug, "chi_wards")
        # Live body is the published doc; latest revision holds the draft.
        self.assertIn("Published English prose", str(tag_en.body))
        latest = tag_en.get_latest_revision_as_object()
        self.assertIn("Newer draft prose", str(latest.body))
        self.assertTrue(tag_en.has_unpublished_changes)

        draft_tag = TagPage.objects.get(slug="draft-tag")
        self.assertFalse(draft_tag.live)

        place = PlacePage.objects.get(slug="chicago")
        self.assertTrue(place.live)
        self.assertEqual(place.districtr_map_slugs, ["chi_wards", "chi_blocks"])
        self.assertIsInstance(place.get_parent().specific, PlacesIndexPage)
        self.assertIsInstance(tag_en.get_parent().specific, TagsIndexPage)

    def test_command_is_idempotent(self):
        self._seed_fixtures()
        call_command("migrate_tiptap")
        page_count = Page.objects.count()
        tag_count = TagPage.objects.count()
        revision_count = Revision.objects.count()

        call_command("migrate_tiptap")

        self.assertEqual(Page.objects.count(), page_count)
        self.assertEqual(TagPage.objects.count(), tag_count)
        # Unchanged rows are skipped entirely: no new revisions either.
        self.assertEqual(Revision.objects.count(), revision_count)
        self.assertEqual(
            TagPage.objects.filter(slug="fair-maps").count(), 2
        )  # en + es, no duplicates

    def test_command_picks_up_legacy_edits_on_rerun(self):
        self._seed_fixtures()
        call_command("migrate_tiptap")
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE cms.tags_content SET published_content = %s::jsonb "
                "WHERE slug = 'fair-maps' AND language = 'es'",
                [json.dumps(doc(paragraph(text("Texto corregido"))))],
            )
        call_command("migrate_tiptap")
        tag_es = TagPage.objects.get(slug="fair-maps", locale__language_code="es")
        self.assertIn("Texto corregido", str(tag_es.body))
        self.assertEqual(TagPage.objects.filter(slug="fair-maps").count(), 2)

    def test_dry_run_writes_nothing(self):
        self._seed_fixtures()
        before = Page.objects.count()
        call_command("migrate_tiptap", "--dry-run")
        self.assertEqual(Page.objects.count(), before)
        self.assertFalse(TagPage.objects.exists())

    def test_dry_run_fails_on_text_loss(self):
        # Inline text inside a custom node has nowhere to go in the block
        # structure -> the fidelity check must fail the run.
        self._insert(
            "tags_content",
            "lossy",
            "en",
            published=doc(
                {
                    "type": "planGalleryNode",
                    "attrs": {},
                    "content": [text("stranded text")],
                }
            ),
        )
        with self.assertRaises(CommandError):
            call_command("migrate_tiptap", "--dry-run")

    def test_json_report(self):
        import tempfile

        self._seed_fixtures()
        with tempfile.NamedTemporaryFile(suffix=".json", mode="r") as report_file:
            call_command(
                "migrate_tiptap", "--dry-run", "--json-report", report_file.name
            )
            report = json.load(report_file)
        rows = {(r["content_type"], r["slug"], r["language"]) for r in report}
        self.assertIn(("tags", "fair-maps", "en"), rows)
        self.assertIn(("tags", "fair-maps", "es"), rows)
        self.assertIn(("places", "chicago", "en"), rows)
        entry = next(
            r for r in report if r["slug"] == "fair-maps" and r["language"] == "en"
        )
        self.assertTrue(entry["text_ok"])
        self.assertEqual(entry["docs"]["published"]["output_blocks"]["plan_gallery"], 1)
