"""
Team-based Wagtail admin scoping (authapi.models.Team / authapi.teams).

Covers the membership helpers, the gallery permission policy (object + queryset
scoping), and an end-to-end admin check that a team-scoped member sees/edits
only their team's galleries while admins and team-less users are unaffected.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import connection
from django.test import RequestFactory, TestCase
from django.urls import reverse
from django.utils.text import slugify
from wagtail.models import Site

from authapi.models import Team, TeamDistrictrMap, TeamMembership
from authapi.teams import (
    TeamScopedModelPermissionPolicy,
    TeamScopedViewGrantPermissionPolicy,
    districtr_map_slugs_for_user,
    team_slugs_for_user,
    user_is_team_scoped,
)
from content.models import PlacePage, PlacesIndexPage, TagPage, TagsIndexPage
from content.wagtail_hooks import (
    _is_out_of_scope_page,
    scope_content_pages_in_explorer,
)
from datastore.models import DistrictrMap, GerryDBTable
from galleries.models import Gallery, GallerySection

PASSWORD = "correct-horse-battery-staple"


def make_user(group_name, email):
    user = get_user_model().objects.create_user(
        username=email, email=email, password=PASSWORD
    )
    user.groups.add(Group.objects.get(name=group_name))
    return user


def make_team(name, *, members=(), maps=()):
    team = Team.objects.create(name=name, slug=slugify(name))
    for user in members:
        TeamMembership.objects.create(team=team, user=user)
    for districtr_map in maps:
        # districtr_map is a db_constraint=False FK to the managed=False
        # DistrictrMap mirror, so passing a bare uuid also works when the
        # mirror table is absent.
        if isinstance(districtr_map, DistrictrMap):
            TeamDistrictrMap.objects.create(team=team, districtr_map=districtr_map)
        else:
            TeamDistrictrMap.objects.create(team=team, districtr_map_id=districtr_map)
    return team


def create_mirror_tables(*models):
    """Build the managed=False datastore mirrors inside the test transaction
    (mirrors datastore/test_overlay_compose.py)."""
    with connection.schema_editor() as editor:
        for model in models:
            editor.create_model(model)


def make_gallery(slug, *, team):
    gallery = Gallery(
        slug=slug,
        title=slug.replace("-", " ").title(),
        section=GallerySection.PUBLIC_GALLERY,
        team=team,
        live=False,
    )
    gallery.save()
    gallery.save_revision().publish()
    gallery.refresh_from_db()
    return gallery


class TeamHelperTests(TestCase):
    def test_superuser_never_scoped(self):
        root = get_user_model().objects.create_superuser(
            username="root@d.org", email="root@d.org", password=PASSWORD
        )
        make_team("Team", members=[root])
        self.assertFalse(user_is_team_scoped(root))

    def test_admin_group_never_scoped(self):
        admin = make_user("admin", "admin@d.org")
        make_team("Team", members=[admin])
        self.assertFalse(user_is_team_scoped(admin))

    def test_partner_without_team_not_scoped(self):
        self.assertFalse(user_is_team_scoped(make_user("partner", "e@d.org")))

    def test_partner_with_team_is_scoped(self):
        partner = make_user("partner", "e@d.org")
        make_team("Team A", members=[partner])
        self.assertTrue(user_is_team_scoped(partner))
        self.assertEqual(team_slugs_for_user(partner), {"team-a"})

    def test_slugs_union_across_teams(self):
        partner = make_user("partner", "e@d.org")
        make_team("T1", members=[partner])
        make_team("T2", members=[partner])
        self.assertEqual(team_slugs_for_user(partner), {"t1", "t2"})


class GalleryScopingPolicyTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.policy = TeamScopedModelPermissionPolicy(
            Gallery, team_filter_field="team_id"
        )
        cls.member = make_user("partner", "member@d.org")
        cls.team_a = make_team("Team A", members=[cls.member])
        cls.team_b = make_team("Team B")
        cls.mine = make_gallery("mine", team=cls.team_a)
        cls.theirs = make_gallery("theirs", team=cls.team_b)

    def test_member_instances_scoped_to_team(self):
        qs = self.policy.instances_user_has_permission_for(self.member, "change")
        self.assertEqual(set(qs.values_list("slug", flat=True)), {"mine"})

    def test_member_can_change_in_scope(self):
        self.assertTrue(
            self.policy.user_has_permission_for_instance(
                self.member, "change", self.mine
            )
        )

    def test_member_cannot_change_out_of_scope(self):
        self.assertFalse(
            self.policy.user_has_permission_for_instance(
                self.member, "change", self.theirs
            )
        )

    def test_admin_unscoped(self):
        admin = make_user("admin", "admin@d.org")
        qs = self.policy.instances_user_has_permission_for(admin, "change")
        self.assertEqual(set(qs.values_list("slug", flat=True)), {"mine", "theirs"})

    def test_teamless_partner_unscoped(self):
        loner = make_user("partner", "loner@d.org")
        qs = self.policy.instances_user_has_permission_for(loner, "change")
        self.assertEqual(set(qs.values_list("slug", flat=True)), {"mine", "theirs"})


class GalleryAdminScopingViewTests(TestCase):
    """End-to-end through the Wagtail snippet views."""

    @classmethod
    def setUpTestData(cls):
        cls.member = make_user("partner", "member@d.org")
        cls.team_a = make_team("Team A", members=[cls.member])
        cls.team_b = make_team("Team B")
        cls.mine = make_gallery("scoped-visible", team=cls.team_a)
        cls.theirs = make_gallery("scoped-hidden", team=cls.team_b)

    def setUp(self):
        self.client.force_login(self.member)

    def test_list_shows_only_team_galleries(self):
        response = self.client.get(reverse("wagtailsnippets_galleries_gallery:list"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Scoped Visible")
        self.assertNotContains(response, "Scoped Hidden")

    def test_edit_in_scope_allowed(self):
        url = reverse("wagtailsnippets_galleries_gallery:edit", args=[self.mine.pk])
        self.assertEqual(self.client.get(url).status_code, 200)

    def test_edit_out_of_scope_denied(self):
        url = reverse("wagtailsnippets_galleries_gallery:edit", args=[self.theirs.pk])
        self.assertNotEqual(self.client.get(url).status_code, 200)

    def test_delete_out_of_scope_denied(self):
        url = reverse("wagtailsnippets_galleries_gallery:delete", args=[self.theirs.pk])
        self.assertNotEqual(self.client.get(url).status_code, 200)

    def test_create_view_restricts_team_choices(self):
        response = self.client.get(reverse("wagtailsnippets_galleries_gallery:add"))
        self.assertEqual(response.status_code, 200)
        field = response.context["form"].fields["team"]
        self.assertEqual(set(field.queryset), {self.team_a})
        self.assertTrue(field.required)

    def test_unpublish_out_of_scope_denied(self):
        # UnpublishView checks only the model-level publish permission; the
        # generic before_unpublish hook is the instance-level gate.
        url = reverse(
            "wagtailsnippets_galleries_gallery:unpublish", args=[self.theirs.pk]
        )
        self.client.post(url)
        self.theirs.refresh_from_db()
        self.assertTrue(self.theirs.live)

    def test_copy_out_of_scope_404(self):
        # The stock CopyView prefills from a bare get_object_or_404 — the
        # scoped copy view must 404 out-of-scope sources.
        url = reverse("wagtailsnippets_galleries_gallery:copy", args=[self.theirs.pk])
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_copy_in_scope_restricts_team(self):
        url = reverse("wagtailsnippets_galleries_gallery:copy", args=[self.mine.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        field = response.context["form"].fields["team"]
        self.assertEqual(set(field.queryset), {self.team_a})


class MapModuleScopingTests(TestCase):
    """DistrictrMap modules: members get scoped, view-only access (admins keep
    full edit). DistrictrMap reaches its Teams via TeamDistrictrMap."""

    @classmethod
    def setUpTestData(cls):
        create_mirror_tables(GerryDBTable, DistrictrMap)
        cls.policy = TeamScopedViewGrantPermissionPolicy(
            DistrictrMap, team_filter_field="team_links__team_id"
        )
        layer = GerryDBTable.objects.create(name="blocks")
        cls.map_a = DistrictrMap.objects.create(
            name="Map A", districtr_map_slug="ma", parent_layer=layer
        )
        cls.map_b = DistrictrMap.objects.create(
            name="Map B", districtr_map_slug="mb", parent_layer=layer
        )
        cls.member = make_user("partner", "mm-member@d.org")
        make_team("Map Team A", members=[cls.member], maps=[cls.map_a])

    def test_member_view_instances_scoped(self):
        qs = self.policy.instances_user_has_permission_for(self.member, "view")
        self.assertEqual(set(qs.values_list("districtr_map_slug", flat=True)), {"ma"})

    def test_member_granted_view_without_django_permission(self):
        # A partner holds no datastore.view_districtrmap; membership grants it.
        self.assertTrue(self.policy.user_has_permission(self.member, "view"))

    def test_member_cannot_change(self):
        self.assertFalse(self.policy.user_has_permission(self.member, "change"))

    def test_member_object_view_in_and_out_of_scope(self):
        self.assertTrue(
            self.policy.user_has_permission_for_instance(
                self.member, "view", self.map_a
            )
        )
        self.assertFalse(
            self.policy.user_has_permission_for_instance(
                self.member, "view", self.map_b
            )
        )

    def test_admin_sees_all_and_can_change(self):
        admin = make_user("admin", "mm-admin@d.org")
        qs = self.policy.instances_user_has_permission_for(admin, "view")
        self.assertEqual(
            set(qs.values_list("districtr_map_slug", flat=True)), {"ma", "mb"}
        )
        self.assertTrue(self.policy.user_has_permission(admin, "change"))

    def test_teamless_partner_gets_no_view(self):
        loner = make_user("partner", "mm-loner@d.org")
        self.assertFalse(self.policy.user_has_permission(loner, "view"))


class ContentPageScopingTests(TestCase):
    """TagPages and PlacePages are scoped through their districtr map slug(s) ->
    DistrictrMap -> TeamDistrictrMap, enforced by the content/wagtail_hooks page
    hooks. A PlacePage is in scope when it features at least one team map."""

    @classmethod
    def setUpTestData(cls):
        create_mirror_tables(GerryDBTable, DistrictrMap)
        layer = GerryDBTable.objects.create(name="blocks")
        map_in = DistrictrMap.objects.create(
            name="In", districtr_map_slug="chi_wards", parent_layer=layer
        )
        DistrictrMap.objects.create(
            name="Out", districtr_map_slug="tx_other", parent_layer=layer
        )

        home = Site.objects.get(is_default_site=True).root_page
        cls.tags_index = TagsIndexPage(title="Tags", slug="tags")
        home.add_child(instance=cls.tags_index)
        cls.tag_in = TagPage(
            title="In Tag", slug="in-tag", districtr_map_slug="chi_wards"
        )
        cls.tags_index.add_child(instance=cls.tag_in)
        cls.tag_out = TagPage(
            title="Out Tag", slug="out-tag", districtr_map_slug="tx_other"
        )
        cls.tags_index.add_child(instance=cls.tag_out)

        cls.places_index = PlacesIndexPage(title="Places", slug="places")
        home.add_child(instance=cls.places_index)
        # Features chi_wards (team's) + tx_other (not) -> in scope (any overlap).
        cls.place_in = PlacePage(
            title="In Place",
            slug="in-place",
            districtr_map_slugs=["chi_wards", "tx_other"],
        )
        cls.places_index.add_child(instance=cls.place_in)
        cls.place_out = PlacePage(
            title="Out Place", slug="out-place", districtr_map_slugs=["tx_other"]
        )
        cls.places_index.add_child(instance=cls.place_out)

        cls.member = make_user("partner", "tp-member@d.org")
        make_team("Tag Team A", members=[cls.member], maps=[map_in])
        cls.admin = make_user("admin", "tp-admin@d.org")

    def _request(self, user):
        request = RequestFactory().get("/admin/pages/")
        request.user = user
        return request

    def test_slugs_for_user_resolves_through_map(self):
        self.assertEqual(districtr_map_slugs_for_user(self.member), {"chi_wards"})

    def test_explorer_hides_out_of_scope_tagpage_for_member(self):
        result = scope_content_pages_in_explorer(
            self.tags_index, self.tags_index.get_children(), self._request(self.member)
        )
        slugs = set(result.values_list("slug", flat=True))
        self.assertEqual(slugs, {"in-tag"})

    def test_explorer_hides_out_of_scope_placepage_for_member(self):
        result = scope_content_pages_in_explorer(
            self.places_index,
            self.places_index.get_children(),
            self._request(self.member),
        )
        slugs = set(result.values_list("slug", flat=True))
        # in-place overlaps the team's map; out-place does not.
        self.assertEqual(slugs, {"in-place"})

    def test_explorer_unfiltered_for_admin(self):
        tags = scope_content_pages_in_explorer(
            self.tags_index, self.tags_index.get_children(), self._request(self.admin)
        )
        places = scope_content_pages_in_explorer(
            self.places_index,
            self.places_index.get_children(),
            self._request(self.admin),
        )
        self.assertEqual(
            set(tags.values_list("slug", flat=True)), {"in-tag", "out-tag"}
        )
        self.assertEqual(
            set(places.values_list("slug", flat=True)), {"in-place", "out-place"}
        )

    def test_member_blocked_from_out_of_scope_pages(self):
        self.assertTrue(_is_out_of_scope_page(self._request(self.member), self.tag_out))
        self.assertTrue(
            _is_out_of_scope_page(self._request(self.member), self.place_out)
        )

    def test_member_allowed_in_scope_pages(self):
        self.assertFalse(_is_out_of_scope_page(self._request(self.member), self.tag_in))
        self.assertFalse(
            _is_out_of_scope_page(self._request(self.member), self.place_in)
        )

    def test_admin_never_blocked(self):
        self.assertFalse(_is_out_of_scope_page(self._request(self.admin), self.tag_out))
        self.assertFalse(
            _is_out_of_scope_page(self._request(self.admin), self.place_out)
        )

    def test_all_page_mutation_hooks_registered(self):
        # Wagtail's unpublish/copy/move/bulk paths never fire the edit/delete
        # hooks — each needs its own registration or it defaults to open.
        from wagtail import hooks as wagtail_hooks

        for name in (
            "before_edit_page",
            "before_delete_page",
            "before_unpublish_page",
            "before_copy_page",
            "before_move_page",
            "before_bulk_action",
        ):
            modules = [fn.__module__ for fn in wagtail_hooks.get_hooks(name)]
            self.assertIn("content.wagtail_hooks", modules, name)

    def test_member_cannot_unpublish_out_of_scope_page_via_admin(self):
        self.client.force_login(self.member)
        response = self.client.post(
            reverse("wagtailadmin_pages:unpublish", args=[self.tag_out.id])
        )
        self.assertNotEqual(response.status_code, 200)
        self.tag_out.refresh_from_db()
        self.assertTrue(self.tag_out.live)


class ContentPageFormScopingTests(TestCase):
    """The team-aware page forms only offer a member their own teams' map slugs
    and reject out-of-scope slugs (content/forms.py). The model-bound form is
    built the way Wagtail's page views build it (base_form_class + panels)."""

    @classmethod
    def setUpTestData(cls):
        create_mirror_tables(GerryDBTable, DistrictrMap)
        layer = GerryDBTable.objects.create(name="blocks")
        team_maps = []
        for slug in ("chi_wards", "tx_other"):
            dmap = DistrictrMap.objects.create(
                name=slug, districtr_map_slug=slug, parent_layer=layer
            )
            team_maps.append(dmap)
        cls.member = make_user("partner", "form-member@d.org")
        make_team("Form Team", members=[cls.member], maps=[team_maps[0]])
        cls.admin = make_user("admin", "form-admin@d.org")

    @staticmethod
    def _form_class(model):
        from wagtail.admin.panels import get_edit_handler

        return get_edit_handler(model).get_form_class()

    def _bound(self, model, *, user, data=None):
        return self._form_class(model)(data=data, instance=model(), for_user=user)

    def test_tagpage_form_offers_only_team_slugs(self):
        form = self._bound(TagPage, user=self.member)
        choices = dict(form.fields["districtr_map_slug"].choices)
        self.assertEqual(set(choices), {"chi_wards"})

    def test_tagpage_form_rejects_out_of_scope_slug(self):
        form = self._bound(
            TagPage,
            user=self.member,
            data={
                "title": "T",
                "slug": "t",
                "districtr_map_slug": "tx_other",
                "body-count": "0",
            },
        )
        form.is_valid()
        self.assertIn("districtr_map_slug", form.errors)

    def test_placepage_form_rejects_out_of_scope_slug(self):
        form = self._bound(
            PlacePage,
            user=self.member,
            data={
                "title": "P",
                "slug": "p",
                "districtr_map_slugs": ["chi_wards", "tx_other"],
                "body-count": "0",
            },
        )
        form.is_valid()
        self.assertIn("districtr_map_slugs", form.errors)

    def test_admin_form_unrestricted(self):
        # Admin keeps the plain free-text CharField (no scoped choices).
        form = self._bound(TagPage, user=self.admin)
        self.assertFalse(hasattr(form.fields["districtr_map_slug"], "choices"))

    def test_placepage_form_preserves_other_teams_slugs_and_order(self):
        # A shared PlacePage carries another team's map; saving must keep it,
        # in its original position, even though the member can't select it.
        page = PlacePage(
            title="P", slug="p", districtr_map_slugs=["tx_other", "chi_wards"]
        )
        form = self._form_class(PlacePage)(
            data={
                "title": "P",
                "slug": "p",
                "districtr_map_slugs": ["chi_wards"],
                "body-count": "0",
            },
            instance=page,
            for_user=self.member,
        )
        # full_clean rather than is_valid: the bare instance lacks Wagtail's
        # tree fields (path/depth/...), which aren't what's under test here.
        form.full_clean()
        self.assertNotIn("districtr_map_slugs", form.errors)
        self.assertEqual(
            form.cleaned_data["districtr_map_slugs"], ["tx_other", "chi_wards"]
        )
