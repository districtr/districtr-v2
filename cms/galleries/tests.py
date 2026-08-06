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
from django.test import TestCase
from django.urls import reverse
from wagtail.permission_policies.base import ModelPermissionPolicy
from wagtail.snippets.models import get_snippet_models

from authapi.models import Team, TeamMembership
from authapi.serializers import DistrictrTokenObtainPairSerializer
from galleries.models import Gallery, GalleryEntry, GallerySection, GalleryVisibility

PASSWORD = "correct-horse-battery-staple"


def make_user(group_name, email):
    user = get_user_model().objects.create_user(
        username=email, email=email, password=PASSWORD
    )
    user.groups.add(Group.objects.get(name=group_name))
    return user


def default_team():
    team, _ = Team.objects.get_or_create(
        slug="districtr", defaults={"name": "Districtr"}
    )
    return team


def make_gallery(slug, *, live=True, entries=(), **kwargs):
    """A published (or draft) gallery whose live state matches its revision."""
    kwargs.setdefault("title", slug.replace("-", " ").title())
    kwargs.setdefault("section", GallerySection.PUBLIC_GALLERY)
    kwargs.setdefault("team", default_team())
    gallery = Gallery(
        slug=slug,
        live=False,
        entries=[GalleryEntry(**entry) for entry in entries],
        **kwargs,
    )
    gallery.save()
    revision = gallery.save_revision()
    if live:
        revision.publish()
        gallery.refresh_from_db()
    return gallery


class GalleryRegistrationTests(TestCase):
    def test_gallery_is_a_registered_snippet(self):
        self.assertIn(Gallery, get_snippet_models())

    def test_plan_gallery_block_choices_include_galleries(self):
        # content.blocks.PlanGalleryBlock.gallerySlug feeds from Gallery
        # lazily (galleries.models imports content.blocks, so the reverse
        # import must stay deferred). Drafts are offered too: partners wire
        # up a page while the gallery awaits publication.
        from content.blocks import gallery_slug_choices

        make_gallery("published-picks")
        make_gallery("draft-picks", live=False)
        slugs = [slug for slug, _label in gallery_slug_choices()]
        self.assertIn("published-picks", slugs)
        self.assertIn("draft-picks", slugs)

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
        gallery.save_revision()
        payload = self.client.get("/api/galleries/drafty").json()
        self.assertEqual(payload["title"], "Published title")

    def test_unknown_slug_404(self):
        response = self.client.get("/api/galleries/missing")
        self.assertEqual(response.status_code, 404)

    def test_team_owned_gallery_publishes(self):
        team = Team.objects.create(name="Redistricting Partners", slug="rp")
        gallery = make_gallery("scoped", team=team)
        self.assertEqual(gallery.team.slug, "rp")
        self.assertEqual(self.client.get("/api/galleries/scoped").status_code, 200)


class GroupOnlyGalleryApiTests(TestCase):
    """group_only enforcement: the token must carry the owning team's slug
    in its `teams` claim (minted from the user's teams) or the `admin`
    role — a merely-valid login is no longer enough."""

    @classmethod
    def setUpTestData(cls):
        team = Team.objects.create(name="Team A", slug="team-a")
        make_gallery(
            "partners-only",
            visibility=GalleryVisibility.GROUP_ONLY,
            team=team,
        )
        cls.member = make_user("partner", "partner@districtr.org")
        TeamMembership.objects.create(team=team, user=cls.member)
        cls.outsider = make_user("partner", "outsider@districtr.org")
        cls.admin = make_user("admin", "admin@districtr.org")

    def _get(self, user=None, raw_token=None):
        token = raw_token or (
            user
            and str(DistrictrTokenObtainPairSerializer.get_token(user).access_token)
        )
        headers = {"authorization": f"Bearer {token}"} if token else {}
        return self.client.get("/api/galleries/partners-only", headers=headers)

    def test_anonymous_403(self):
        response = self._get()
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response["Access-Control-Allow-Origin"], "*")

    def test_garbage_token_403(self):
        self.assertEqual(self._get(raw_token="not-a-jwt").status_code, 403)

    def test_valid_token_without_team_403(self):
        self.assertEqual(self._get(self.outsider).status_code, 403)

    def test_team_member_200(self):
        response = self._get(self.member)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["slug"], "partners-only")

    def test_admin_200(self):
        self.assertEqual(self._get(self.admin).status_code, 200)


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

    def test_negative_pagination_clamped(self):
        # Negative offset/limit must clamp to 0, not 500 on a negative slice.
        response = self.client.get("/api/galleries/?limit=-1&offset=-5")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])


class GalleryPermissionTests(TestCase):
    """Partners curate drafts; admin publishes (migration 0002 + authapi.0007)."""

    def test_partners_can_draft_but_not_publish(self):
        # ModelPermissionPolicy is what SnippetViewSet consults; "publish" is
        # the extra action DraftStateMixin snippets gate the Publish button on.
        policy = ModelPermissionPolicy(Gallery)
        for group in ("partner", "super_partner"):
            user = make_user(group, f"{group}@districtr.org")
            self.assertTrue(policy.user_has_permission(user, "add"))
            self.assertTrue(policy.user_has_permission(user, "change"))
            self.assertFalse(policy.user_has_permission(user, "publish"))
            self.assertFalse(policy.user_has_permission(user, "delete"))

    def test_admin_can_publish(self):
        policy = ModelPermissionPolicy(Gallery)
        user = make_user("admin", "admin@districtr.org")
        for action in ("add", "change", "delete", "publish"):
            self.assertTrue(
                policy.user_has_permission(user, action),
                f"admin should have {action}",
            )

    def test_all_groups_can_enter_wagtail_admin(self):
        for group in ("admin", "partner", "super_partner"):
            user = make_user(group, f"{group}-access@districtr.org")
            self.assertTrue(
                user.has_perm("wagtailadmin.access_admin"),
                f"{group} should reach the Wagtail admin login",
            )
