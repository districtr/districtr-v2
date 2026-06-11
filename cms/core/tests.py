"""
Tests for the branded transactional email templates in
core/templates/registration/ (used by Django's PasswordResetForm — most
importantly as the account-setup email sent by `manage.py provision_users`).
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.forms import PasswordResetForm
from django.core import mail
from django.test import TestCase


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
        self.assertIn(
            "https://cms.districtr.org/admin/password_reset/confirm/", body
        )
        self.assertIn("https://cms.districtr.org/admin/login/", body)
        self.assertIn("expires", body)
        self.assertIn("ada@districtr.org", body)
        # The {% comment %} block must not leak into the rendered body.
        self.assertNotIn("{%", body)
        self.assertNotIn("PasswordResetForm", body)
