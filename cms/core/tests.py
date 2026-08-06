"""
Tests for the core app's admin-wide behaviour: the branded transactional
email templates (core/templates/registration/), and the Wagtail admin
customisations in core/wagtail_hooks.py — the role-aware "Districtr
shortcuts" dashboard panel, main-menu trimming, and the branding CSS hook.
"""

from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.contrib.auth.forms import PasswordResetForm
from django.core import mail
from django.test import RequestFactory, TestCase
from django.urls import reverse

from core.wagtail_hooks import DistrictrShortcutsPanel, trim_main_menu


class PasswordResetEmailTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="ada@districtr.org",
            email="ada@districtr.org",
            password="correct-horse-battery-staple",
            first_name="Ada",
        )

    def send(self):
        form = PasswordResetForm(data={"email": self.user.email})
        self.assertTrue(form.is_valid())
        form.save(
            domain_override="cms.districtr.org",
            use_https=True,
            email_template_name="registration/password_reset_email.html",
        )

    def test_branded_subject_and_recipient(self):
        self.send()
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.subject, "Set your password for the Districtr CMS")
        self.assertEqual(message.to, ["ada@districtr.org"])

    def test_body_has_setup_link_login_link_and_expiry_note(self):
        self.send()
        body = mail.outbox[0].body

        self.assertIn("Hi Ada", body)
        self.assertIn("Set your password", body)
        # Wagtail's reset-confirm view, on the admin host.
        self.assertIn("https://cms.districtr.org/admin/password_reset/confirm/", body)
        self.assertIn("https://cms.districtr.org/admin/login/", body)
        self.assertIn("expires", body)
        self.assertIn("ada@districtr.org", body)
        # The {% comment %} block must not leak into the rendered body.
        self.assertNotIn("{%", body)
        self.assertNotIn("PasswordResetForm", body)


class HealthzMiddlewareTests(TestCase):
    def test_healthz_ignores_host_validation(self):
        """ALB probes hit the task IP; /healthz must answer before ALLOWED_HOSTS."""
        response = self.client.get("/healthz", HTTP_HOST="10.0.0.1:8080")
        self.assertEqual(response.status_code, 200)


class DistrictrShortcutsPanelTests(TestCase):
    """The role-aware dashboard panel (construct_homepage_panels)."""

    def panel_context(self, user):
        request = RequestFactory().get("/admin/")
        request.user = user
        panel = DistrictrShortcutsPanel(request)
        return panel.get_context_data({"request": request})

    def labels(self, context):
        return {link["label"] for link in context["links"]}

    def test_partner_links(self):
        from datastore.test_admin_tools import make_admin_user

        partner = make_admin_user(email="p@districtr.org", group_name="partner")
        context = self.panel_context(partner)
        labels = self.labels(context)
        # content.0008 provisions the tags index, so the portal-page add link
        # is always available.
        self.assertEqual(
            labels,
            {"Review portal submissions", "Add a portal page", "Galleries"},
        )

    def test_super_partner_adds_data_tools(self):
        from datastore.test_admin_tools import make_admin_user

        user = make_admin_user(email="sp@districtr.org", group_name="super_partner")
        labels = self.labels(self.panel_context(user))
        self.assertIn("Compose map module", labels)
        self.assertIn("Upload overlay", labels)
        self.assertNotIn("Teams", labels)
        self.assertNotIn("Frontend settings", labels)

    def test_admin_adds_admin_screens(self):
        from datastore.test_admin_tools import make_admin_user

        user = make_admin_user(group_name="admin")
        labels = self.labels(self.panel_context(user))
        for label in (
            "Teams",
            "Review tag scopes",
            "Frontend settings",
            "Awaiting your review",
            "Compose map module",
            "Upload overlay",
        ):
            self.assertIn(label, labels)

    def test_team_scoped_partner_sees_own_galleries_and_maps(self):
        from authapi.test_teams import create_mirror_tables, make_gallery, make_team
        from datastore.models import DistrictrMap, GerryDBTable
        from datastore.test_admin_tools import make_admin_user

        create_mirror_tables(GerryDBTable, DistrictrMap)
        layer = GerryDBTable.objects.create(name="blocks")
        map_in = DistrictrMap.objects.create(
            name="Chicago", districtr_map_slug="chi", parent_layer=layer
        )
        DistrictrMap.objects.create(
            name="Texas", districtr_map_slug="tx", parent_layer=layer
        )
        partner = make_admin_user(email="p@districtr.org", group_name="partner")
        team = make_team("Team A", members=[partner], maps=[map_in])
        make_gallery("ours", team=team)
        make_gallery("theirs", team=make_team("Team B"))

        context = self.panel_context(partner)
        self.assertEqual(
            [gallery["label"] for gallery in context["galleries"]], ["Ours"]
        )
        self.assertEqual([m["label"] for m in context["maps"]], ["Chicago"])
        # Partners may only inspect map modules, not edit them.
        self.assertIn(
            reverse("wagtailsnippets_datastore_districtrmap:inspect", args=[map_in.pk]),
            context["maps"][0]["url"],
        )
        # Team-scoped users get their galleries enumerated, not the index link.
        self.assertNotIn("Galleries", self.labels(context))

    def test_groupless_user_gets_empty_panel(self):
        user = get_user_model().objects.create_user(
            username="lone@districtr.org",
            email="lone@districtr.org",
            password="correct-horse-battery-staple",
        )
        context = self.panel_context(user)
        self.assertEqual(context["links"], [])
        self.assertEqual(context["galleries"], [])
        self.assertEqual(context["maps"], [])

    def test_panel_renders_on_the_admin_home(self):
        from datastore.test_admin_tools import PASSWORD, make_admin_user

        make_admin_user()
        self.client.login(username="dataops@districtr.org", password=PASSWORD)
        response = self.client.get(reverse("wagtailadmin_home"))
        self.assertContains(response, "Districtr shortcuts")
        self.assertContains(response, reverse("moderation_review_portals"))


class MenuTrimTests(TestCase):
    """construct_main_menu: Reports is admin-only; Images/Documents stay for
    everyone because RICH_TEXT_FEATURES includes image/embed/document-link."""

    def request_for(self, user):
        request = RequestFactory().get("/admin/")
        request.user = user
        return request

    def menu(self):
        return [
            SimpleNamespace(name="reports"),
            SimpleNamespace(name="images"),
            SimpleNamespace(name="documents"),
        ]

    def test_reports_hidden_for_partner(self):
        from datastore.test_admin_tools import make_admin_user

        for group in ("partner", "super_partner"):
            items = self.menu()
            user = make_admin_user(email=f"{group}@districtr.org", group_name=group)
            trim_main_menu(self.request_for(user), items)
            self.assertEqual([item.name for item in items], ["images", "documents"])

    def test_reports_kept_for_admin(self):
        from datastore.test_admin_tools import make_admin_user

        items = self.menu()
        trim_main_menu(self.request_for(make_admin_user(group_name="admin")), items)
        self.assertEqual(
            [item.name for item in items], ["reports", "images", "documents"]
        )


class BrandingCssTests(TestCase):
    def test_admin_pages_link_the_districtr_stylesheet(self):
        from datastore.test_admin_tools import PASSWORD, make_admin_user

        make_admin_user()
        self.client.login(username="dataops@districtr.org", password=PASSWORD)
        response = self.client.get(reverse("wagtailadmin_home"))
        self.assertContains(response, "core/admin.css")
