"""
Grant the `admin` group (created by authapi.0001_create_groups) all model
permissions on the datastore mirrors so Wagtail's snippet permission policy
lets admins manage them.

Editors/reviewers/partners intentionally get NO datastore permissions by
default — the "Data" menu simply does not appear for them. Grant per-model
permissions through the Wagtail group admin if a partner ever needs access.

Note: GerryDBTable is additionally locked down in the UI by a read-only
permission policy on its viewset (datastore/wagtail_hooks.py), regardless of
the permissions granted here.
"""

from django.db import migrations

from core.migration_utils import ensure_permissions, model_permissions


def grant_admin_permissions(apps, schema_editor):
    # post_migrate hasn't fired on a fresh DB; materialize datastore's rows.
    ensure_permissions("datastore", apps, schema_editor)

    Group = apps.get_model("auth", "Group")
    admin_group = Group.objects.get(name="admin")
    admin_group.permissions.add(*model_permissions(apps, "datastore"))


def revoke_admin_permissions(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    admin_group = Group.objects.get(name="admin")
    admin_group.permissions.remove(*model_permissions(apps, "datastore"))


class Migration(migrations.Migration):
    dependencies = [
        ("datastore", "0001_initial"),
        ("authapi", "0001_create_groups"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(grant_admin_permissions, revoke_admin_permissions),
    ]
