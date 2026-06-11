import csv
from urllib.parse import urlparse

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.forms import PasswordResetForm
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError


class AccountSetupForm(PasswordResetForm):
    """PasswordResetForm that also emails users with unusable passwords.

    Freshly provisioned accounts have no usable password yet — that is the
    point of the setup email — but the stock form's get_users() silently
    skips such users. The reset token itself works fine for them (it hashes
    the unusable-password marker, so it invalidates once a password is set).
    """

    def get_users(self, email):
        User = get_user_model()
        email_field_name = User.get_email_field_name()
        return User._default_manager.filter(
            **{f"{email_field_name}__iexact": email, "is_active": True}
        )


class Command(BaseCommand):
    help = (
        "Create accounts from a CSV of email,name,group rows and email each "
        "user a password-setup (reset) link. Wagtail has no invite-by-email "
        "flow; this is the documented admin-creates-account pattern."
    )

    def add_arguments(self, parser):
        parser.add_argument("csv_path", help="CSV with header: email,name,group")
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would happen without writing or emailing",
        )

    def handle(self, *args, **options):
        User = get_user_model()
        created, skipped = 0, 0
        with open(options["csv_path"], newline="") as f:
            for row in csv.DictReader(f):
                email = row["email"].strip().lower()
                name = row.get("name", "").strip()
                group_name = row.get("group", "").strip()
                if not email:
                    continue
                try:
                    group = Group.objects.get(name=group_name)
                except Group.DoesNotExist:
                    raise CommandError(
                        f"Unknown group {group_name!r} for {email} — expected "
                        "one of admin/editor/reviewer/partner"
                    )

                if User.objects.filter(username=email).exists():
                    self.stdout.write(f"skip (exists): {email}")
                    skipped += 1
                    continue

                if options["dry_run"]:
                    self.stdout.write(f"would create: {email} ({group_name})")
                    created += 1
                    continue

                first, _, last = name.partition(" ")
                user = User.objects.create_user(
                    username=email,
                    email=email,
                    first_name=first,
                    last_name=last,
                )
                user.set_unusable_password()
                # Group admins also need is_staff-equivalent access to the
                # Wagtail admin; Wagtail gates on its own `access_admin`
                # permission, granted per group in later migrations.
                user.save()
                user.groups.add(group)

                # No request here, so derive the email's domain/protocol from
                # WAGTAILADMIN_BASE_URL (django.contrib.sites isn't installed,
                # making domain_override mandatory).
                base_url = urlparse(settings.WAGTAILADMIN_BASE_URL)
                form = AccountSetupForm(data={"email": email})
                if form.is_valid():
                    form.save(
                        domain_override=base_url.netloc,
                        use_https=base_url.scheme == "https",
                        email_template_name="registration/password_reset_email.html",
                    )
                self.stdout.write(f"created: {email} ({group_name})")
                created += 1

        self.stdout.write(
            self.style.SUCCESS(f"done: {created} created, {skipped} skipped")
        )
