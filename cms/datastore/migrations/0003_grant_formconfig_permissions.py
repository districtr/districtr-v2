# Grant FormConfig (portal form) permissions: admins get everything;
# partners and super_partners get add/change/view so they can run the portal
# wizard and edit their teams' form configs (scoped to admin_teams by the
# ViewSet). Delete stays admin-only — the backend FK RESTRICTs it anyway
# while submissions exist.

from django.db import migrations

from core.migration_utils import ensure_permissions, model_permissions

PARTNER_ACTIONS = ("add", "change", "view")


def grant(apps, schema_editor):
    ensure_permissions("datastore", apps, schema_editor)
    Group = apps.get_model("auth", "Group")
    perms = model_permissions(apps, "datastore", model="formconfig")

    admin = Group.objects.filter(name="admin").first()
    if admin:
        admin.permissions.add(*perms)
    partner_perms = perms.filter(
        codename__in=[f"{action}_formconfig" for action in PARTNER_ACTIONS]
    )
    for name in ("partner", "super_partner"):
        group = Group.objects.filter(name=name).first()
        if group:
            group.permissions.add(*partner_perms)


def revoke(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    perms = model_permissions(apps, "datastore", model="formconfig")
    for group in Group.objects.filter(name__in=("admin", "partner", "super_partner")):
        group.permissions.remove(*perms)


class Migration(migrations.Migration):
    dependencies = [
        ("datastore", "0002_formconfig"),
        ("authapi", "0002_provision_roles"),
    ]

    operations = [
        migrations.RunPython(grant, revoke),
    ]
