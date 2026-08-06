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
    """The dashboard action cards mirror the sidebar action labels exactly."""

    def panel_context(self, user):
        request = RequestFactory().get("/admin/")
        request.user = user
        panel = DistrictrShortcutsPanel(request)
        return panel.get_context_data({"request": request})

    def labels(self, context):
        return [card["label"] for card in context["cards"]]

    def test_cards_gate_by_role_not_by_label(self):
        # Pin the GATING decisions, not the label strings (those mirror the
        # sidebar and change freely): partners get no module/admin cards,
        # super partners add module tools, admins add the admin screens.
        from core.testing import make_admin_user

        partner = set(
            self.labels(
                self.panel_context(
                    make_admin_user(email="p@districtr.org", group_name="partner")
                )
            )
        )
        super_partner = set(
            self.labels(
                self.panel_context(
                    make_admin_user(
                        email="sp@districtr.org", group_name="super_partner"
                    )
                )
            )
        )
        admin = set(
            self.labels(self.panel_context(make_admin_user(group_name="admin")))
        )
        self.assertTrue(partner)
        self.assertLess(partner, super_partner)
        self.assertLess(super_partner, admin)
        self.assertIn("Teams", admin - super_partner)

    def test_groupless_user_gets_empty_panel(self):
        user = get_user_model().objects.create_user(
            username="lone@districtr.org",
            email="lone@districtr.org",
            password="correct-horse-battery-staple",
        )
        self.assertEqual(self.panel_context(user)["cards"], [])


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
        from core.testing import make_admin_user

        for group in ("partner", "super_partner"):
            items = self.menu()
            user = make_admin_user(email=f"{group}@districtr.org", group_name=group)
            trim_main_menu(self.request_for(user), items)
            self.assertEqual([item.name for item in items], ["images", "documents"])

    def test_reports_kept_for_admin(self):
        from core.testing import make_admin_user

        items = self.menu()
        trim_main_menu(self.request_for(make_admin_user(group_name="admin")), items)
        self.assertEqual(
            [item.name for item in items], ["reports", "images", "documents"]
        )


class BrandingCssTests(TestCase):
    def test_admin_pages_link_the_districtr_stylesheet(self):
        from core.testing import PASSWORD, make_admin_user

        make_admin_user()
        self.client.login(username="dataops@districtr.org", password=PASSWORD)
        response = self.client.get(reverse("wagtailadmin_home"))
        self.assertContains(response, "core/admin.css")


class GroupMenuItemTests(TestCase):
    """The shared group-gating primitive every custom menu item rides on."""

    def _request_for(self, user):
        request = RequestFactory().get("/admin/")
        request.user = user
        return request

    def test_visibility(self):
        from django.contrib.auth import get_user_model

        from core.menu import GroupMenuItem
        from core.testing import make_user

        item = GroupMenuItem("X", "/admin/x/", groups={"partner"})
        self.assertTrue(item.is_shown(self._request_for(make_user("partner"))))
        self.assertFalse(
            item.is_shown(self._request_for(make_user("admin", "a@districtr.org")))
        )
        root = get_user_model().objects.create_superuser(
            username="root@districtr.org",
            email="root@districtr.org",
            password="pw",
        )
        self.assertTrue(item.is_shown(self._request_for(root)))
