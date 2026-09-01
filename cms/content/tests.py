"""
Tests for the legacy-CMS replacement: the TipTap -> StreamField converter,
the public compat API, and the migrate_tiptap management command.

The command tests read cms.tags_content/cms.places_content via raw SQL.
The Django test database does not have the legacy `cms` schema, so setUp
creates it (and minimal tables matching the real columns the command reads)
inside the per-test transaction; the rollback drops it again.
"""

import importlib
import io
import os
import json
import uuid
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command as django_call_command
from django.core.management.base import CommandError
from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from wagtail.models import GroupPagePermission, Locale, Page, Revision, Site
from wagtail.permission_policies.pages import PagePermissionPolicy

from content.models import (
    PlacePage,
    PlacesIndexPage,
    StaticIndexPage,
    StaticPage,
    TagPage,
    TagsIndexPage,
)
from content.tiptap import (
    extract_prosemirror_text,
    extract_stream_text,
    prosemirror_to_html,
    tiptap_to_stream_data,
    unwrap_legacy_content,
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
        self.assertEqual(
            result.stream_data[0]["value"],
            PLAN_GALLERY_ATTRS,
        )

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

    def test_rejects_non_doc_shapes(self):
        # A shape the converter does not recognise must abort loudly, never
        # convert to an empty stream (that silently drops the whole page).
        with self.assertRaises(ValueError):
            tiptap_to_stream_data({"body": doc(paragraph(text("wrapped")))})
        with self.assertRaises(ValueError):
            tiptap_to_stream_data({"type": "paragraph"})


class UnwrapLegacyContentTests(SimpleTestCase):
    """Legacy columns store {"title", "subtitle", "body": <doc>}."""

    def test_wrapper_shape(self):
        body = doc(paragraph(text("hi")))
        value = {"title": "Colorado", "subtitle": "The state", "body": body}
        self.assertEqual(unwrap_legacy_content(value), (body, "Colorado", "The state"))

    def test_bare_doc_accepted(self):
        body = doc(paragraph(text("hi")))
        self.assertEqual(unwrap_legacy_content(body), (body, None, None))

    def test_none_passthrough(self):
        self.assertEqual(unwrap_legacy_content(None), (None, None, None))

    def test_empty_strings_become_none(self):
        body = doc()
        self.assertEqual(
            unwrap_legacy_content({"title": "", "subtitle": "", "body": body}),
            (body, None, None),
        )

    def test_garbage_raises(self):
        with self.assertRaises(ValueError):
            unwrap_legacy_content({"unexpected": "shape"})
        with self.assertRaises(ValueError):
            unwrap_legacy_content(["not", "a", "dict"])


# ---------------------------------------------------------------------------
# Page permission grants (authapi/0002_provision_roles)
# ---------------------------------------------------------------------------


class PagePermissionGrantTests(TestCase):
    """Wagtail's PagePermissionPolicy ignores Django model permissions — it
    only looks at tree-scoped GroupPagePermission rows. content.0002 grants
    them on the root page (authapi/0002_provision_roles); without those rows
    the Pages explorer is hidden entirely and partners cannot edit ANY
    content pages."""

    @staticmethod
    def user_in_group(group_name):
        user = get_user_model().objects.create_user(
            username=f"{group_name}@districtr.org",
            email=f"{group_name}@districtr.org",
            password="correct-horse-battery-staple",
        )
        user.groups.add(Group.objects.get(name=group_name))
        return user

    def test_partner_passes_page_permission_checks(self):
        # Partners are own-content-only: add, but no tree-wide change —
        # Wagtail's owner model grants edit on owned pages. No publish
        # either: publishing goes through admin review.
        user = self.user_in_group("partner")
        policy = PagePermissionPolicy()
        self.assertTrue(policy.user_has_permission(user, "add"))
        self.assertFalse(
            policy.user_has_permission(user, "publish"),
            "partner publishes go through admin review",
        )
        # Policy-level "change" stays True (add-permission holders may change
        # their OWN pages) — the tree-wide grant row is what must be gone.
        self.assertFalse(
            GroupPagePermission.objects.filter(
                group__name__in=["partner", "super_partner"],
                permission__codename="change_page",
            ).exists(),
            "partners must not hold tree-wide change_page",
        )
        root = Page.get_first_root_node()
        perms = root.permissions_for_user(user)
        self.assertTrue(perms.can_add_subpage())

    def test_partner_edits_own_pages_only(self):
        user = self.user_in_group("partner")
        root = Page.get_first_root_node()
        own = root.add_child(instance=Page(title="Mine", slug="mine-own", owner=user))
        other = root.add_child(instance=Page(title="Other", slug="not-mine"))
        self.assertTrue(own.permissions_for_user(user).can_edit())
        self.assertFalse(other.permissions_for_user(user).can_edit())

    def test_super_partner_matches_partner_on_pages(self):
        user = self.user_in_group("super_partner")
        policy = PagePermissionPolicy()
        self.assertTrue(policy.user_has_permission(user, "add"))
        self.assertFalse(policy.user_has_permission(user, "publish"))

    def test_admin_passes_page_permission_checks(self):
        user = self.user_in_group("admin")
        policy = PagePermissionPolicy()
        for action in ("add", "change", "publish", "unlock"):
            self.assertTrue(
                policy.user_has_permission(user, action),
                f"admin should have '{action}' page permission",
            )


# ---------------------------------------------------------------------------
# "Site content" menu
# ---------------------------------------------------------------------------


class SiteContentMenuTests(TestCase):
    @staticmethod
    def _request_for(user):
        from django.test import RequestFactory

        request = RequestFactory().get("/admin/")
        request.user = user
        return request

    @staticmethod
    def _user(group_name):
        user = get_user_model().objects.create_user(
            username=f"{group_name}-menu@districtr.org",
            email=f"{group_name}-menu@districtr.org",
            password="correct-horse-battery-staple",
        )
        user.groups.add(Group.objects.get(name=group_name))
        return user

    def test_partner_sees_no_site_content_entries(self):
        # Portals moved to the Portals hub; Site content keeps only the
        # admin-only places/static entries, so it self-hides for partners.
        from content.wagtail_hooks import register_site_content_menu_item

        submenu = register_site_content_menu_item()
        request = self._request_for(self._user("partner"))
        shown = [
            item
            for item in submenu.menu.registered_menu_items
            if item.is_shown(request)
        ]
        self.assertEqual(shown, [])

    def test_partner_sees_portals_hub_menu(self):
        from portals.wagtail_hooks import register_portals_menu_item

        item = register_portals_menu_item()
        request = self._request_for(self._user("partner"))
        self.assertTrue(item.is_shown(request))
        self.assertEqual(item.url, "/admin/portals/")


# ---------------------------------------------------------------------------
# Provisioning migrations (locales 0006, admin approval workflow 0007)
# ---------------------------------------------------------------------------


class ProvisioningMigrationTests(TestCase):
    def test_all_content_languages_have_locales(self):
        from django.conf import settings

        existing = set(Locale.objects.values_list("language_code", flat=True))
        expected = {code for code, _ in settings.WAGTAIL_CONTENT_LANGUAGES}
        self.assertTrue(expected <= existing, expected - existing)

    def test_admin_approval_workflow_wired_up(self):
        from wagtail.models import GroupApprovalTask, Workflow

        workflow = Workflow.objects.get(name="Admin approval")
        self.assertTrue(workflow.active)
        task = GroupApprovalTask.objects.get(name="Admin approval")
        self.assertEqual([g.name for g in task.groups.all()], ["admin"])
        self.assertEqual([t.task_id for t in workflow.workflow_tasks.all()], [task.pk])
        # Assigned to the whole page tree (galleries live in page content).
        self.assertTrue(workflow.workflow_pages.filter(page_id=1).exists())

    def test_index_pages_provisioned_under_home(self):
        # content/0002_provision_site creates all three index pages (default locale, live).
        home = Site.objects.get(is_default_site=True).root_page
        for model in (TagsIndexPage, PlacesIndexPage, StaticIndexPage):
            index = model.objects.get(locale__language_code="en")
            self.assertTrue(index.live)
            self.assertEqual(index.get_parent().pk, home.pk)

    def test_index_provisioning_is_idempotent(self):
        from content.provision import ensure_default_index_pages

        before = Page.objects.count()
        ensure_default_index_pages()
        self.assertEqual(Page.objects.count(), before)

    def test_index_pages_are_singletons(self):
        # max_count=1: with the provisioned instance in place, the admin can
        # never offer creating a duplicate index under Home (or anywhere).
        home = Site.objects.get(is_default_site=True).root_page
        for model in (TagsIndexPage, PlacesIndexPage, StaticIndexPage):
            self.assertFalse(model.can_create_at(home))


# ---------------------------------------------------------------------------
# Frontend URL overrides / preview (pages are served by Next.js, not Wagtail)
# ---------------------------------------------------------------------------


@override_settings(FRONTEND_URL="https://beta.districtr.org")
class FrontendUrlTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        en = Locale.objects.get(language_code="en")
        cls.tags_index = TagsIndexPage.objects.get(locale=en)
        cls.places_index = PlacesIndexPage.objects.get(locale=en)
        cls.static_index = StaticIndexPage.objects.get(locale=en)

        cls.tag = TagPage(title="Fair Maps", slug="fair-maps")
        cls.tags_index.add_child(instance=cls.tag)
        cls.place = PlacePage(title="Chicago", slug="chicago")
        cls.places_index.add_child(instance=cls.place)
        cls.static = StaticPage(title="Rules", slug="rules")
        cls.static_index.add_child(instance=cls.static)

    def test_content_page_urls_point_at_frontend(self):
        # Both .url (used by the admin "View live" button and flash message)
        # and .full_url must be the absolute frontend URL — the base .url
        # returns a relative path on single-site setups, which would resolve
        # against the Wagtail admin domain.
        self.assertEqual(self.tag.url, "https://beta.districtr.org/portal/fair-maps")
        self.assertEqual(
            self.tag.full_url, "https://beta.districtr.org/portal/fair-maps"
        )
        self.assertEqual(self.place.url, "https://beta.districtr.org/place/chicago")
        self.assertEqual(self.static.url, "https://beta.districtr.org/rules")

    def test_index_page_urls(self):
        self.assertEqual(self.tags_index.url, "https://beta.districtr.org/portals")
        self.assertEqual(self.places_index.url, "https://beta.districtr.org/places")
        # No frontend listing for static pages: not routable, no "View live".
        self.assertIsNone(self.static_index.url)

    def test_preview_disabled(self):
        # No Wagtail template exists; previewing raised TemplateDoesNotExist.
        for page in (
            self.tag,
            self.place,
            self.static,
            self.tags_index,
            self.places_index,
            self.static_index,
        ):
            self.assertEqual(page.preview_modes, [])
            self.assertFalse(page.is_previewable())

    def test_admin_editor_shows_frontend_live_url(self):
        # The page editor (where Preview/"View live" 500'd) renders, offers
        # no preview panel, and links "View live" at the frontend URL.
        self.tag.save_revision(clean=False).publish()
        get_user_model().objects.create_superuser(
            username="root@districtr.org",
            email="root@districtr.org",
            password="correct-horse-battery-staple",
        )
        self.client.login(
            username="root@districtr.org", password="correct-horse-battery-staple"
        )
        response = self.client.get(f"/admin/pages/{self.tag.pk}/edit/")
        self.assertEqual(response.status_code, 200)
        html = response.content.decode()
        self.assertIn("https://beta.districtr.org/portal/fair-maps", html)
        self.assertNotIn('data-side-panel-toggle="preview"', html)


# ---------------------------------------------------------------------------
# Public compat API
# ---------------------------------------------------------------------------


class ContentApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.en = Locale.objects.get(language_code="en")
        cls.es = Locale.objects.get(language_code="es")

        # Provisioned by content/0002_provision_site (see content/provision.py).
        cls.tags_index = TagsIndexPage.objects.get(locale=cls.en)
        cls.places_index = PlacesIndexPage.objects.get(locale=cls.en)

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

        static_index = StaticIndexPage.objects.get(locale=cls.en)
        rules = StaticPage(
            title="Rules",
            slug="rules",
            body=[{"type": "rich_text", "value": "<p>The rules</p>"}],
        )
        static_index.add_child(instance=rules)
        rules.save_revision(clean=False).publish()

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

    def test_rich_text_internal_links_expanded_in_api(self):
        # Stored rich text keeps Wagtail's contracted reference form
        # (<a linktype="page" id="N">). The public API must serve expanded,
        # frontend-ready HTML (real href, no linktype/embedtype attributes) —
        # the Next.js frontend renders it verbatim.
        target = TagPage(title="Target", slug="link-target")
        self.tags_index.add_child(instance=target)
        target.save_revision(clean=False).publish()

        linker = TagPage(
            title="Linker",
            slug="linker",
            body=[
                {
                    "type": "rich_text",
                    "value": f'<p><a linktype="page" id="{target.pk}">go</a></p>',
                },
                {
                    "type": "boilerplate",
                    "value": {
                        "customContent": (
                            f'<p><a linktype="page" id="{target.pk}">also</a></p>'
                        )
                    },
                },
            ],
        )
        self.tags_index.add_child(instance=linker)
        linker.save_revision(clean=False).publish()

        payload = self.client.get("/api/content/tags/slug/linker").json()
        body = payload["content"]["body"]
        self.assertNotIn("linktype=", json.dumps(body))
        self.assertIn(f'<a href="{target.url}">go</a>', body[0]["value"])
        self.assertIn(
            f'<a href="{target.url}">also</a>', body[1]["value"]["customContent"]
        )

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

    def test_list_includes_non_english_only_pages_without_language_param(self):
        # A slug whose ONLY live page is non-English must still appear in the
        # unfiltered list: without a language param the endpoint serves live
        # pages across ALL languages (no implicit English filter).
        es_index = self.tags_index.get_translation(self.es)
        solo = TagPage(title="Solo Español", slug="solo-es", locale=self.es)
        es_index.add_child(instance=solo)
        solo.save_revision(clean=False).publish()

        rows = self.client.get("/api/content/tags/list").json()
        self.assertIn(("solo-es", "es"), [(r["slug"], r["language"]) for r in rows])
        # ... and explicit filtering still excludes it.
        en_rows = self.client.get("/api/content/tags/list?language=en").json()
        self.assertNotIn("solo-es", [r["slug"] for r in en_rows])

    def test_static_detail_has_no_map_fields(self):
        payload = self.client.get("/api/content/static/slug/rules").json()
        self.assertEqual(payload["type"], "static")
        self.assertEqual(payload["content"]["title"], "Rules")
        self.assertNotIn("districtr_map_slug", payload["content"])
        self.assertNotIn("districtr_map_slugs", payload["content"])

    def test_static_list(self):
        rows = self.client.get("/api/content/static/list").json()
        self.assertEqual(rows, [{"slug": "rules", "title": "Rules", "language": "en"}])

    def test_list_negative_pagination_clamped(self):
        # Negative offset/limit must clamp to 0, not 500 on a negative slice.
        response = self.client.get("/api/content/tags/list?limit=-1&offset=-5")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

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

    def test_migration_refuses_unattended_import_without_owner_mapping(self):
        """content/0003 runs migrate_tiptap from inside `migrate` (the deploy
        runs migrations as a one-off task), and only a human can map legacy
        Auth0 subjects onto users. Without MIGRATE_TIPTAP_OWNERS the import
        would silently leave every page unowned — and therefore uneditable by
        its author under own-content-only permissions — so it must refuse."""
        migration = importlib.import_module(
            "content.migrations.0003_import_legacy_content"
        )
        self._insert("tags_content", "attributed", "en", published=doc())
        with mock.patch.dict(os.environ, {"MIGRATE_TIPTAP_OWNERS": ""}):
            with self.assertRaises(CommandError) as ctx:
                migration.import_legacy_content(None, connection.schema_editor())
        self.assertIn("MIGRATE_TIPTAP_OWNERS", str(ctx.exception))

    def test_migration_imports_when_ownership_is_explicitly_waived(self):
        migration = importlib.import_module(
            "content.migrations.0003_import_legacy_content"
        )
        self._insert("tags_content", "waived", "en", published=doc())
        with mock.patch.dict(os.environ, {"MIGRATE_TIPTAP_OWNERS": "unowned"}):
            migration.import_legacy_content(None, connection.schema_editor())
        self.assertTrue(TagPage.objects.filter(slug="waived").exists())

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

    def test_wrapper_title_subtitle_and_body(self):
        # Real legacy rows wrap the doc: {"title", "subtitle", "body": <doc>}.
        # The wrapper title/subtitle win over section-header/slug derivation.
        self._insert(
            "places_content",
            "dc",
            "en",
            published={
                "title": "Washington, DC",
                "subtitle": "The district",
                "body": doc(paragraph(text("DC prose"))),
            },
        )
        call_command("migrate_tiptap")
        page = PlacePage.objects.get(slug="dc")
        self.assertTrue(page.live)
        self.assertEqual(page.title, "Washington, DC")
        self.assertEqual(page.subtitle, "The district")
        self.assertIn("DC prose", str(page.body))

    def test_wrapper_rows_are_idempotent(self):
        self._insert(
            "places_content",
            "dc",
            "en",
            published={
                "title": "Washington, DC",
                "subtitle": "",
                "body": doc(paragraph(text("DC prose"))),
            },
        )
        call_command("migrate_tiptap")
        revisions = Revision.objects.count()
        call_command("migrate_tiptap")
        self.assertEqual(Revision.objects.count(), revisions)
        self.assertEqual(PlacePage.objects.filter(slug="dc").count(), 1)

    def test_unrecognized_content_shape_aborts(self):
        # Garbage shapes must abort loudly (with the row named), never
        # silently migrate as an empty page.
        self._insert("tags_content", "garbage", "en", published={"nodes": []})
        with self.assertRaisesMessage(CommandError, "tags/garbage/en"):
            call_command("migrate_tiptap", "--dry-run")

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


# ---------------------------------------------------------------------------
# Form-config injection (portal detail API)
# ---------------------------------------------------------------------------


class FormConfigInjectionTests(TestCase):
    """The portal detail API attaches the portal's form config (camelCase per
    the constants/cms.ts contract) to every form block."""

    def setUp(self):
        from core.testing import create_mirror_tables, make_form_config, make_portal
        from datastore.models import FormConfig

        create_mirror_tables(FormConfig)
        self.portal = make_portal("configured")
        self.portal.body = [{"type": "form", "value": {}}]
        self.portal.save_revision(clean=False).publish()
        make_form_config(
            "configured",
            fields=["first_name", "email", "title", "comment"],
            required=["title", "comment"],
        )

    def _form_block(self, slug):
        payload = self.client.get(f"/api/content/tags/slug/{slug}").json()
        return next(
            block["value"]
            for block in payload["content"]["body"]
            if block["type"] == "form"
        )

    def test_form_block_carries_config_and_portal_tag(self):
        value = self._form_block("configured")
        self.assertEqual(value["portalId"], "configured")
        self.assertEqual(value["collectionMode"], "prompt")
        self.assertEqual(value["customFields"], [])
        self.assertEqual(value["fields"], ["first_name", "email", "title", "comment"])
        self.assertEqual(value["requiredFields"], ["title", "comment"])
        self.assertFalse(value["requireEmailConfirm"])
        self.assertEqual(value["mandatoryTags"], ["configured"])
        # Bug fix: an empty allow-list serves null ("all modules"), not [].
        self.assertIsNone(value["allowListModules"])

    def test_map_create_buttons_carry_portal_id(self):
        self.portal.body = [
            {"type": "form", "value": {}},
            {
                "type": "map_create_buttons",
                "value": {"views": [], "type": "simple"},
            },
        ]
        self.portal.save_revision(clean=False).publish()
        payload = self.client.get("/api/content/tags/slug/configured").json()
        buttons = next(
            block["value"]
            for block in payload["content"]["body"]
            if block["type"] == "map_create_buttons"
        )
        # Maps started from this portal get a draft submission for it.
        self.assertEqual(buttons["portalId"], "configured")

    def test_portal_without_config_serves_null_fields(self):
        from core.testing import make_portal

        bare = make_portal("bare")
        bare.body = [{"type": "form", "value": {}}]
        bare.save_revision(clean=False).publish()
        value = self._form_block("bare")
        self.assertIsNone(value["fields"])

    def test_map_create_buttons_without_config_get_no_portal_id(self):
        # The decision that matters: a config-less portal must NOT stamp
        # portalId onto its create buttons — that key is what makes
        # create_document mint a draft, and the backend logs-and-degrades
        # only because the CMS normally withholds it here.
        from core.testing import make_portal

        bare = make_portal("bare-buttons")
        bare.body = [
            {"type": "map_create_buttons", "value": {"views": [], "type": "simple"}}
        ]
        bare.save_revision(clean=False).publish()
        payload = self.client.get("/api/content/tags/slug/bare-buttons").json()
        buttons = next(
            block["value"]
            for block in payload["content"]["body"]
            if block["type"] == "map_create_buttons"
        )
        self.assertNotIn("portalId", buttons)


# ---------------------------------------------------------------------------
# Portal wizard
# ---------------------------------------------------------------------------


class PortalWizardTests(TestCase):
    """The wizard creates the draft TagPage and its FormConfig atomically —
    a half-created portal (page without config, or the reverse) is the
    failure mode it exists to prevent."""

    def setUp(self):
        from core.testing import create_mirror_tables, make_admin_user
        from datastore.models import (
            DistrictrMap,
            FormConfig,
            FormFieldCustom,
            GerryDBTable,
        )

        create_mirror_tables(GerryDBTable, DistrictrMap, FormConfig, FormFieldCustom)
        layer = GerryDBTable.objects.create(name="blocks")
        self.map = DistrictrMap.objects.create(
            name="Chi", districtr_map_slug="chi_wards", parent_layer=layer
        )
        self.admin = make_admin_user(group_name="admin")
        self.client.force_login(self.admin)
        self.url = "/admin/portals/new/"

    def _payload(self, **overrides):
        data = {
            "preset": "competition",
            "title": "River Portal",
            "slug": "river-portal",
            "districtr_map_slug": "chi_wards",
            "collection_mode": "prompt",
            "fields": ["first_name", "email", "title", "comment"],
            "required_fields": ["title", "comment"],
            # custom-questions formset management form (rows may be blank)
            "questions-TOTAL_FORMS": "3",
            "questions-INITIAL_FORMS": "0",
            "questions-MIN_NUM_FORMS": "0",
            "questions-MAX_NUM_FORMS": "1000",
            "questions-0-label": "",
            "questions-1-label": "",
            "questions-2-label": "",
        }
        data.update(overrides)
        return data

    def test_creates_draft_page_and_config(self):
        from content.models import TagPage
        from datastore.models import FormConfig

        response = self.client.post(self.url, self._payload())
        page = TagPage.objects.get(slug="river-portal")
        self.assertRedirects(
            response,
            f"/admin/pages/{page.pk}/edit/",
            fetch_redirect_response=False,
        )
        # Draft, not live (pages keep review); body follows the preset.
        self.assertFalse(page.live)
        body_types = [block.block_type for block in page.body]
        self.assertIn("form", body_types)
        self.assertIn("map_create_buttons", body_types)
        self.assertIn("plan_gallery", body_types)

        config = FormConfig.objects.get(portal_id="river-portal")
        self.assertEqual(config.name, "River Portal")
        self.assertEqual(config.collection_mode, "prompt")
        self.assertEqual(config.required_fields, ["title", "comment"])

    def test_presets_shape_mode_and_body(self):
        from content.models import TagPage
        from datastore.models import FormConfig

        cases = {
            "educational": (
                "internal",
                {"map_create_buttons"},
                {"form", "plan_gallery"},
            ),
            "public_engagement": (
                "auto_public",
                {"map_create_buttons", "plan_gallery"},
                {"form"},
            ),
            "state_commission": (
                "form",
                {"form", "comment_gallery"},
                {"map_create_buttons"},
            ),
        }
        for preset, (mode, expected, absent) in cases.items():
            slug = f"preset-{preset.replace('_', '-')}"
            response = self.client.post(
                self.url,
                self._payload(
                    preset=preset, slug=slug, title=slug, collection_mode=mode
                ),
            )
            page = TagPage.objects.get(slug=slug)
            self.assertEqual(response.status_code, 302, preset)
            body_types = set(block.block_type for block in page.body)
            self.assertTrue(expected <= body_types, (preset, body_types))
            self.assertFalse(absent & body_types, (preset, body_types))
            self.assertEqual(
                FormConfig.objects.get(portal_id=slug).collection_mode, mode
            )

    def test_custom_questions_created_with_slugified_keys(self):
        from datastore.models import FormFieldCustom

        response = self.client.post(
            self.url,
            self._payload(
                **{
                    "questions-0-label": "What neighborhood do you live in?",
                    "questions-0-field_type": "text",
                    "questions-0-required": "on",
                    "questions-1-label": "Tell us your story",
                    "questions-1-field_type": "textarea",
                }
            ),
        )
        self.assertEqual(response.status_code, 302, response.content)
        customs = list(FormFieldCustom.objects.filter(form_config_id="river-portal"))
        self.assertEqual(
            [c.key for c in customs],
            ["custom_what_neighborhood_do_you_live_in", "custom_tell_us_your_story"],
        )
        self.assertTrue(customs[0].required)
        self.assertEqual(customs[1].field_type, "textarea")

    def test_slug_collision_with_existing_page_creates_nothing(self):
        from core.testing import make_portal
        from datastore.models import FormConfig

        make_portal("river-portal", districtr_map_slug="chi_wards")
        response = self.client.post(self.url, self._payload())
        self.assertContains(response, "already exists")
        self.assertFalse(FormConfig.objects.filter(portal_id="river-portal").exists())

    def test_slug_collision_with_existing_config_creates_nothing(self):
        from content.models import TagPage
        from core.testing import make_form_config

        make_form_config("river-portal")
        response = self.client.post(self.url, self._payload())
        self.assertContains(response, "already exists")
        self.assertFalse(TagPage.objects.filter(slug="river-portal").exists())

    def test_required_fields_must_be_shown(self):
        response = self.client.post(
            self.url,
            self._payload(fields=["title"], required_fields=["title", "comment"]),
        )
        self.assertContains(response, "must also be shown")

    def test_team_scoped_member_cannot_use_out_of_scope_map(self):
        from core.testing import make_admin_user, make_team

        partner = make_admin_user(email="scoped@districtr.org", group_name="partner")
        make_team("Elsewhere Team", members=[partner])  # no maps assigned
        self.client.force_login(partner)
        response = self.client.post(self.url, self._payload())
        # chi_wards is not one of the member's team maps: not offered, and
        # rejected on POST (the choice set is the guard).
        self.assertContains(response, "valid choice")

    def test_groupless_user_denied(self):
        from core.testing import make_admin_user

        user = make_admin_user(email="lone@districtr.org", group_name="partner")
        user.groups.clear()
        self.client.force_login(user)
        response = self.client.get(self.url)
        self.assertRedirects(response, "/admin/")


class PortalWizardScopingTests(TestCase):
    """Non-admins fail closed: only their own teams/maps are offered, and a
    portal they create must keep one of their teams as moderator."""

    def setUp(self):
        from core.testing import create_mirror_tables, make_team, make_user
        from datastore.models import DistrictrMap, FormConfig, GerryDBTable

        create_mirror_tables(GerryDBTable, DistrictrMap, FormConfig)
        layer = GerryDBTable.objects.create(name="blocks")
        self.my_map = DistrictrMap.objects.create(
            name="Mine", districtr_map_slug="my_map", parent_layer=layer
        )
        DistrictrMap.objects.create(
            name="Theirs", districtr_map_slug="their_map", parent_layer=layer
        )
        self.partner = make_user("partner", "p@d.org", access_admin=True)
        self.my_team = make_team(
            "Mine Team", members=[self.partner], maps=[self.my_map]
        )
        self.other_team = make_team("Other Team")

    def _form(self, user, **data):
        from content.portal_wizard import PortalWizardForm

        base = {
            "title": "P",
            "slug": "p",
            "districtr_map_slug": "my_map",
            "preset": "custom",
            "collection_mode": "prompt",
            "fields": ["title", "comment"],
            "required_fields": ["title"],
            "admin_teams": ["mine-team"],
        }
        base.update(data)
        return PortalWizardForm(base, user=user)

    def test_scoped_partner_cannot_use_other_teams_map_or_team(self):
        form = self._form(self.partner, districtr_map_slug="their_map")
        self.assertFalse(form.is_valid())
        self.assertIn("districtr_map_slug", form.errors)

        form = self._form(self.partner, admin_teams=["other-team"])
        self.assertFalse(form.is_valid())
        self.assertIn("admin_teams", form.errors)

    def test_scoped_partner_must_keep_own_team_as_moderator(self):
        form = self._form(self.partner, admin_teams=[])
        self.assertFalse(form.is_valid())
        self.assertIn("admin_teams", form.errors)

    def test_team_less_partner_fails_closed(self):
        from core.testing import make_user

        loner = make_user("partner", "loner@d.org", access_admin=True)
        form = self._form(loner)
        # No team -> no map choices, no team choices: nothing is grantable.
        self.assertFalse(form.is_valid())

    def test_own_team_and_map_accepted(self):
        form = self._form(self.partner)
        self.assertTrue(form.is_valid(), form.errors)


class PortalWizardAtomicityTests(TestCase):
    """A failure between the page write and the config write must roll BOTH
    back — a half-created portal is the failure mode the wizard exists to
    prevent, and the form-level collision checks are TOCTOU-advisory only."""

    def setUp(self):
        from core.testing import create_mirror_tables, make_admin_user
        from datastore.models import DistrictrMap, FormConfig, GerryDBTable

        create_mirror_tables(GerryDBTable, DistrictrMap, FormConfig)
        layer = GerryDBTable.objects.create(name="blocks")
        DistrictrMap.objects.create(
            name="Chi", districtr_map_slug="chi_wards", parent_layer=layer
        )
        self.client.force_login(make_admin_user(group_name="admin"))

    def test_config_failure_rolls_back_the_page(self):
        from unittest import mock

        from django.db import IntegrityError

        from content.models import TagPage

        with mock.patch(
            "content.portal_wizard.FormConfig.objects.create",
            side_effect=IntegrityError("duplicate key"),
        ):
            response = self.client.post(
                "/admin/portals/new/",
                {
                    "title": "River Portal",
                    "slug": "river-portal",
                    "districtr_map_slug": "chi_wards",
                    "template": "map_collection",
                    "fields": ["title", "comment"],
                    "required_fields": ["title"],
                },
            )
        # Re-rendered with a form error, page rolled back with the config.
        self.assertEqual(response.status_code, 200)
        self.assertFalse(TagPage.objects.filter(slug="river-portal").exists())


class PortalWizardPresetPayloadTests(TestCase):
    """The preset table drives the client-side prefill — the server saves
    only posted values, so the payload IS the preset decision surface."""

    def setUp(self):
        from core.testing import create_mirror_tables, make_admin_user
        from datastore.models import DistrictrMap, FormConfig, GerryDBTable

        create_mirror_tables(GerryDBTable, DistrictrMap, FormConfig)
        self.client.force_login(make_admin_user(group_name="admin"))

    def test_preset_payload_is_a_parseable_dict_with_the_preset_decisions(self):
        import json as json_module
        import re

        response = self.client.get("/admin/portals/new/")
        match = re.search(
            r'<script id="preset-data" type="application/json">(.*?)</script>',
            response.content.decode(),
            re.S,
        )
        assert match, "preset-data json_script tag missing"
        payload = json_module.loads(match.group(1))
        # A pre-serialized payload would double-encode into a STRING here,
        # silently killing the prefill (every preset -> prompt mode).
        self.assertIsInstance(payload, dict)
        # The preset DECISIONS (not the full field lists): each preset's
        # collection posture is the product promise its description makes.
        self.assertEqual(payload["educational"]["collection_mode"], "internal")
        self.assertEqual(payload["competition"]["collection_mode"], "prompt")
        self.assertEqual(payload["public_engagement"]["collection_mode"], "auto_public")
        self.assertEqual(payload["state_commission"]["collection_mode"], "form")
        self.assertTrue(payload["state_commission"]["require_email_confirm"])


class FormModeButtonSuppressionTests(TestCase):
    """form-mode portals collect only through the form — their map-create
    buttons must stay plain (no portalId => no auto-draft)."""

    def test_form_mode_map_buttons_get_no_portal_id(self):
        from core.testing import (
            create_mirror_tables,
            make_form_config,
            make_portal,
        )
        from datastore.models import FormConfig, FormFieldCustom

        create_mirror_tables(FormConfig, FormFieldCustom)
        portal = make_portal("form-portal")
        config = make_form_config("form-portal")
        config.collection_mode = "form"
        config.save()
        portal.body = [
            {"type": "map_create_buttons", "value": {"views": [], "type": "simple"}}
        ]
        portal.save_revision(clean=False).publish()

        payload = self.client.get("/api/content/tags/slug/form-portal").json()
        buttons = next(
            block["value"]
            for block in payload["content"]["body"]
            if block["type"] == "map_create_buttons"
        )
        self.assertNotIn("portalId", buttons)
