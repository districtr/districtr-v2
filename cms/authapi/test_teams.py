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
from wagtail.models import Site

from authapi.models import Team, TeamMapGroup, TeamMembership
from authapi.teams import (
    TeamScopedModelPermissionPolicy,
    TeamScopedViewGrantPermissionPolicy,
    districtr_map_slugs_for_user,
    map_group_slugs_for_user,
    user_is_team_scoped,
)
from content.models import PlacePage, PlacesIndexPage, TagPage, TagsIndexPage
from content.wagtail_hooks import (
    _is_out_of_scope_page,
    scope_content_pages_in_explorer,
)
from datastore.models import (
    DistrictrMap,
    DistrictrMapsToGroups,
    GerryDBTable,
    MapGroup,
)
from galleries.models import Gallery, GallerySection

PASSWORD = "correct-horse-battery-staple"


def make_user(group_name, email):
    user = get_user_model().objects.create_user(
        username=email, email=email, password=PASSWORD
    )
    user.groups.add(Group.objects.get(name=group_name))
    return user


def make_team(name, slug, *, members=(), group_slugs=()):
    team = Team.objects.create(name=name, slug=slug)
    for user in members:
        TeamMembership.objects.create(team=team, user=user)
    for group_slug in group_slugs:
        # map_group is a db_constraint=False FK to the managed=False MapGroup
        # mirror, so a slug can be stored without the public.map_group table.
        TeamMapGroup.objects.create(team=team, map_group_id=group_slug)
    return team


def create_mirror_tables(*models):
    """Build the managed=False datastore mirrors inside the test transaction
    (mirrors datastore/test_overlay_compose.py)."""
    with connection.schema_editor() as editor:
        for model in models:
            editor.create_model(model)


def ensure_map_group_table():
    """Create the managed=False map_group mirror in the test DB.

    Publishing a Gallery whose map_group_id is set touches this Alembic-owned
    table, which the Django test DB doesn't build (mirrors galleries/tests.py).
    Lives in the class transaction, so it rolls back after the class.
    """
    with connection.cursor() as cursor:
        cursor.execute(
            "CREATE TABLE IF NOT EXISTS map_group "
            "(slug varchar PRIMARY KEY, name varchar)"
        )
        cursor.execute(
            "INSERT INTO map_group VALUES "
            "('ga', 'Group A'), ('gb', 'Group B'), ('gc', 'Group C') "
            "ON CONFLICT DO NOTHING"
        )


def make_gallery(slug, *, group_slug):
    gallery = Gallery(
        slug=slug,
        title=slug.replace("-", " ").title(),
        section=GallerySection.PUBLIC_GALLERY,
        map_group_id=group_slug,
        live=False,
    )
    gallery.save()
    # clean=False: full_clean would validate the map_group FK against the
    # absent mirror table (mirrors galleries/tests.py::make_gallery).
    gallery.save_revision(clean=False).publish()
    gallery.refresh_from_db()
    return gallery


class TeamHelperTests(TestCase):
    def test_superuser_never_scoped(self):
        root = get_user_model().objects.create_superuser(
            username="root@d.org", email="root@d.org", password=PASSWORD
        )
        make_team("Team", "team", members=[root], group_slugs=["ga"])
        self.assertFalse(user_is_team_scoped(root))

    def test_admin_group_never_scoped(self):
        admin = make_user("admin", "admin@d.org")
        make_team("Team", "team", members=[admin], group_slugs=["ga"])
        self.assertFalse(user_is_team_scoped(admin))

    def test_editor_without_team_not_scoped(self):
        self.assertFalse(user_is_team_scoped(make_user("editor", "e@d.org")))

    def test_editor_with_team_is_scoped(self):
        editor = make_user("editor", "e@d.org")
        make_team("Team A", "team-a", members=[editor], group_slugs=["ga", "gb"])
        self.assertTrue(user_is_team_scoped(editor))
        self.assertEqual(map_group_slugs_for_user(editor), {"ga", "gb"})

    def test_slugs_union_across_teams(self):
        editor = make_user("editor", "e@d.org")
        make_team("T1", "t1", members=[editor], group_slugs=["ga"])
        make_team("T2", "t2", members=[editor], group_slugs=["gb", "gc"])
        self.assertEqual(map_group_slugs_for_user(editor), {"ga", "gb", "gc"})


class GalleryScopingPolicyTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_map_group_table()
        cls.policy = TeamScopedModelPermissionPolicy(
            Gallery, group_filter_field="map_group_id"
        )
        cls.member = make_user("editor", "member@d.org")
        make_team("Team A", "team-a", members=[cls.member], group_slugs=["ga"])
        cls.mine = make_gallery("mine", group_slug="ga")
        cls.theirs = make_gallery("theirs", group_slug="gb")

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

    def test_teamless_editor_unscoped(self):
        loner = make_user("editor", "loner@d.org")
        qs = self.policy.instances_user_has_permission_for(loner, "change")
        self.assertEqual(set(qs.values_list("slug", flat=True)), {"mine", "theirs"})


class GalleryAdminScopingViewTests(TestCase):
    """End-to-end through the Wagtail snippet views."""

    @classmethod
    def setUpTestData(cls):
        ensure_map_group_table()
        cls.member = make_user("editor", "member@d.org")
        make_team("Team A", "team-a", members=[cls.member], group_slugs=["ga"])
        cls.mine = make_gallery("scoped-visible", group_slug="ga")
        cls.theirs = make_gallery("scoped-hidden", group_slug="gb")

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

    def test_create_view_restricts_map_group_to_team(self):
        response = self.client.get(reverse("wagtailsnippets_galleries_gallery:add"))
        self.assertEqual(response.status_code, 200)
        field = response.context["form"].fields["map_group"]
        self.assertEqual(set(field.queryset.values_list("slug", flat=True)), {"ga"})
        self.assertTrue(field.required)


class MapModuleScopingTests(TestCase):
    """DistrictrMap modules: members get scoped, view-only access (admins keep
    full edit). DistrictrMap reaches MapGroup via DistrictrMapsToGroups."""

    @classmethod
    def setUpTestData(cls):
        create_mirror_tables(
            GerryDBTable, MapGroup, DistrictrMap, DistrictrMapsToGroups
        )
        cls.policy = TeamScopedViewGrantPermissionPolicy(
            DistrictrMap, group_filter_field="group_links__group_id"
        )
        layer = GerryDBTable.objects.create(name="blocks")
        group_a = MapGroup.objects.create(slug="ga", name="Group A")
        group_b = MapGroup.objects.create(slug="gb", name="Group B")
        cls.map_a = DistrictrMap.objects.create(
            name="Map A", districtr_map_slug="ma", parent_layer=layer
        )
        cls.map_b = DistrictrMap.objects.create(
            name="Map B", districtr_map_slug="mb", parent_layer=layer
        )
        DistrictrMapsToGroups.objects.create(districtrmap=cls.map_a, group=group_a)
        DistrictrMapsToGroups.objects.create(districtrmap=cls.map_b, group=group_b)
        cls.member = make_user("editor", "mm-member@d.org")
        make_team("Map Team A", "mm-team-a", members=[cls.member], group_slugs=["ga"])

    def test_member_view_instances_scoped(self):
        qs = self.policy.instances_user_has_permission_for(self.member, "view")
        self.assertEqual(set(qs.values_list("districtr_map_slug", flat=True)), {"ma"})

    def test_member_granted_view_without_django_permission(self):
        # An editor holds no datastore.view_districtrmap; membership grants it.
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

    def test_teamless_editor_gets_no_view(self):
        loner = make_user("editor", "mm-loner@d.org")
        self.assertFalse(self.policy.user_has_permission(loner, "view"))


class ContentPageScopingTests(TestCase):
    """TagPages and PlacePages are scoped through their districtr map slug(s) ->
    DistrictrMap -> MapGroup, enforced by the content/wagtail_hooks page hooks.
    A PlacePage is in scope when it features at least one map the team owns."""

    @classmethod
    def setUpTestData(cls):
        create_mirror_tables(
            GerryDBTable, MapGroup, DistrictrMap, DistrictrMapsToGroups
        )
        layer = GerryDBTable.objects.create(name="blocks")
        group_a = MapGroup.objects.create(slug="ga", name="Group A")
        group_b = MapGroup.objects.create(slug="gb", name="Group B")
        map_in = DistrictrMap.objects.create(
            name="In", districtr_map_slug="chi_wards", parent_layer=layer
        )
        map_out = DistrictrMap.objects.create(
            name="Out", districtr_map_slug="tx_other", parent_layer=layer
        )
        DistrictrMapsToGroups.objects.create(districtrmap=map_in, group=group_a)
        DistrictrMapsToGroups.objects.create(districtrmap=map_out, group=group_b)

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

        cls.member = make_user("editor", "tp-member@d.org")
        make_team("Tag Team A", "tp-team-a", members=[cls.member], group_slugs=["ga"])
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


class ContentPageFormScopingTests(TestCase):
    """The team-aware page forms only offer a member their own teams' map slugs
    and reject out-of-scope slugs (content/forms.py). The model-bound form is
    built the way Wagtail's page views build it (base_form_class + panels)."""

    @classmethod
    def setUpTestData(cls):
        create_mirror_tables(
            GerryDBTable, MapGroup, DistrictrMap, DistrictrMapsToGroups
        )
        layer = GerryDBTable.objects.create(name="blocks")
        group_a = MapGroup.objects.create(slug="ga", name="Group A")
        group_b = MapGroup.objects.create(slug="gb", name="Group B")
        for slug, group in (("chi_wards", group_a), ("tx_other", group_b)):
            dmap = DistrictrMap.objects.create(
                name=slug, districtr_map_slug=slug, parent_layer=layer
            )
            DistrictrMapsToGroups.objects.create(districtrmap=dmap, group=group)
        cls.member = make_user("editor", "form-member@d.org")
        make_team("Form Team", "form-team", members=[cls.member], group_slugs=["ga"])
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
