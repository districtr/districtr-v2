"""
Tests for the curated plan galleries: snippet registration, the
draft -> publish flow against the public API, entry ordering, the
public/group_only visibility gate, the list endpoint, and the
partner-drafts / editor-publishes permission split.

The group_only gate reuses the project's own JWT issuer
(DistrictrTokenObtainPairSerializer) so the verified token is exactly what
the Next.js frontend would send.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import connection
from django.test import TestCase
from django.urls import reverse
from wagtail.permission_policies.base import ModelPermissionPolicy
from wagtail.snippets.models import get_snippet_models

from authapi.serializers import DistrictrTokenObtainPairSerializer
from galleries.models import Gallery, GalleryEntry, GallerySection, GalleryVisibility

PASSWORD = "correct-horse-battery-staple"


def make_user(group_name, email):
    user = get_user_model().objects.create_user(
        username=email, email=email, password=PASSWORD
    )
    user.groups.add(Group.objects.get(name=group_name))
    return user


def make_gallery(slug, *, live=True, entries=(), **kwargs):
    """A published (or draft) gallery whose live state matches its revision."""
    kwargs.setdefault("title", slug.replace("-", " ").title())
    kwargs.setdefault("section", GallerySection.PUBLIC_GALLERY)
    gallery = Gallery(
        slug=slug,
        live=False,
        entries=[GalleryEntry(**entry) for entry in entries],
        **kwargs,
    )
    gallery.save()
    # clean=False mirrors content/tests.py: full_clean would validate the
    # map_group FK against the managed=False mirror table, which does not
    # exist in the test database.
    revision = gallery.save_revision(clean=False)
    if live:
        revision.publish()
        gallery.refresh_from_db()
    return gallery


class GalleryRegistrationTests(TestCase):
    def test_gallery_is_a_registered_snippet(self):
        self.assertIn(Gallery, get_snippet_models())

    def test_viewset_admin_urls_exist(self):
        # register_snippet(GalleryViewSet) wires the admin listing/add/edit
        # views; reverse() failing here means the viewset never registered.
        self.assertEqual(
            reverse("wagtailsnippets_galleries_gallery:list"),
            "/admin/snippets/galleries/gallery/",
        )


class GalleryDetailApiTests(TestCase):
    def test_draft_not_served_until_published(self):
        gallery = make_gallery("works-2026", live=False)
        response = self.client.get("/api/galleries/works-2026")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response["Access-Control-Allow-Origin"], "*")

        gallery.get_latest_revision().publish()
        response = self.client.get("/api/galleries/works-2026")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Access-Control-Allow-Origin"], "*")
        self.assertEqual(response.json()["slug"], "works-2026")

    def test_detail_shape(self):
        make_gallery(
            "favorites",
            title="Favorites",
            section=GallerySection.COI_GALLERY,
            description="<p>Hand-picked <b>plans</b></p>",
            entries=[
                {"document_public_id": 11, "caption": "First", "sort_order": 0},
                {"document_public_id": 22, "caption": "", "sort_order": 1},
            ],
        )
        payload = self.client.get("/api/galleries/favorites").json()
        self.assertEqual(
            payload,
            {
                "title": "Favorites",
                "slug": "favorites",
                "section": "coi_gallery",
                "description": "<p>Hand-picked <b>plans</b></p>",
                "entries": [
                    {"document_public_id": 11, "caption": "First"},
                    {"document_public_id": 22, "caption": ""},
                ],
            },
        )

    def test_entries_follow_curated_sort_order(self):
        make_gallery(
            "ordered",
            entries=[
                {"document_public_id": 1, "sort_order": 2},
                {"document_public_id": 2, "sort_order": 0},
                {"document_public_id": 3, "sort_order": 1},
            ],
        )
        payload = self.client.get("/api/galleries/ordered").json()
        self.assertEqual(
            [entry["document_public_id"] for entry in payload["entries"]], [2, 3, 1]
        )

    def test_live_content_served_while_new_draft_pending(self):
        gallery = make_gallery("drafty", title="Published title")
        gallery.title = "Unpublished draft title"
        gallery.save_revision(clean=False)
        payload = self.client.get("/api/galleries/drafty").json()
        self.assertEqual(payload["title"], "Published title")

    def test_unknown_slug_404(self):
        response = self.client.get("/api/galleries/missing")
        self.assertEqual(response.status_code, 404)

    def test_map_group_scoped_gallery_publishes(self):
        # The map_group mirror is Alembic-owned and absent from the test
        # database; create it inside the per-test transaction (same pattern
        # as content/tests.py creating the legacy cms schema). publish()
        # re-checks FKs when deserializing the revision, so the row must
        # exist — but the gallery table itself has no FK constraint
        # (db_constraint=False).
        with connection.cursor() as cursor:
            cursor.execute(
                "CREATE TABLE map_group (slug varchar PRIMARY KEY, name varchar)"
            )
            cursor.execute(
                "INSERT INTO map_group VALUES ('rp', 'Redistricting Partners')"
            )
        gallery = make_gallery("scoped", map_group_id="rp")
        self.assertEqual(gallery.map_group_id, "rp")
        self.assertEqual(self.client.get("/api/galleries/scoped").status_code, 200)


class GroupOnlyGalleryApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        make_gallery("partners-only", visibility=GalleryVisibility.GROUP_ONLY)
        cls.user = make_user("partner", "partner@districtr.org")

    def _token(self):
        return str(DistrictrTokenObtainPairSerializer.get_token(self.user).access_token)

    def test_anonymous_403(self):
        response = self.client.get("/api/galleries/partners-only")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response["Access-Control-Allow-Origin"], "*")

    def test_garbage_token_403(self):
        response = self.client.get(
            "/api/galleries/partners-only",
            headers={"authorization": "Bearer not-a-jwt"},
        )
        self.assertEqual(response.status_code, 403)

    def test_valid_token_200(self):
        # Simplification (galleries/api.py): ANY valid Districtr-issued token
        # passes — roles are not yet matched against gallery.map_group.
        response = self.client.get(
            "/api/galleries/partners-only",
            headers={"authorization": f"Bearer {self._token()}"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["slug"], "partners-only")


class GalleryListApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        make_gallery(
            "approved",
            section=GallerySection.PUBLIC_GALLERY,
            entries=[
                {"document_public_id": 1, "sort_order": 0},
                {"document_public_id": 2, "sort_order": 1},
            ],
        )
        make_gallery("coi-maps", section=GallerySection.COI_GALLERY)
        make_gallery("pending", section=GallerySection.PUBLIC_GALLERY, live=False)
        make_gallery(
            "internal",
            section=GallerySection.PUBLIC_GALLERY,
            visibility=GalleryVisibility.GROUP_ONLY,
        )

    def test_lists_live_public_galleries_only(self):
        response = self.client.get("/api/galleries/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Access-Control-Allow-Origin"], "*")
        self.assertEqual(
            response.json(),
            [
                {
                    "slug": "approved",
                    "title": "Approved",
                    "section": "public_gallery",
                    "entry_count": 2,
                },
                {
                    "slug": "coi-maps",
                    "title": "Coi Maps",
                    "section": "coi_gallery",
                    "entry_count": 0,
                },
            ],
        )

    def test_section_filter(self):
        rows = self.client.get("/api/galleries/?section=public_gallery").json()
        self.assertEqual([row["slug"] for row in rows], ["approved"])

    def test_unknown_section_400(self):
        response = self.client.get("/api/galleries/?section=nope")
        self.assertEqual(response.status_code, 400)


class GalleryPermissionTests(TestCase):
    """Partner curates drafts; editor/admin publish (migration 0002)."""

    def test_partner_can_draft_but_not_publish(self):
        partner = make_user("partner", "partner@districtr.org")
        # ModelPermissionPolicy is what SnippetViewSet consults; "publish" is
        # the extra action DraftStateMixin snippets gate the Publish button on.
        policy = ModelPermissionPolicy(Gallery)
        self.assertTrue(policy.user_has_permission(partner, "add"))
        self.assertTrue(policy.user_has_permission(partner, "change"))
        self.assertFalse(policy.user_has_permission(partner, "publish"))
        self.assertFalse(policy.user_has_permission(partner, "delete"))

    def test_editor_and_admin_can_publish(self):
        policy = ModelPermissionPolicy(Gallery)
        for group in ("editor", "admin"):
            user = make_user(group, f"{group}@districtr.org")
            for action in ("add", "change", "delete", "publish"):
                self.assertTrue(
                    policy.user_has_permission(user, action),
                    f"{group} should have {action}",
                )

    def test_reviewer_gets_no_gallery_permissions(self):
        reviewer = make_user("reviewer", "reviewer@districtr.org")
        policy = ModelPermissionPolicy(Gallery)
        for action in ("add", "change", "delete", "publish"):
            self.assertFalse(policy.user_has_permission(reviewer, action))

    def test_all_groups_can_enter_wagtail_admin(self):
        for group in ("admin", "editor", "reviewer", "partner"):
            user = make_user(group, f"{group}-access@districtr.org")
            self.assertTrue(
                user.has_perm("wagtailadmin.access_admin"),
                f"{group} should reach the Wagtail admin login",
            )
