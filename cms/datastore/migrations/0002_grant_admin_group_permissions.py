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

from django.apps import apps as global_apps
from django.contrib.auth.management import create_permissions
from django.db import migrations


def grant_admin_permissions(apps, schema_editor):
    # Permission rows are normally created by the post_migrate signal, which
    # has not fired yet on a fresh database — create datastore's now.
    create_permissions(
        global_apps.get_app_config("datastore"),
        apps=apps,
        verbosity=0,
        using=schema_editor.connection.alias,
    )

    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")
    admin_group = Group.objects.get(name="admin")
    datastore_permissions = Permission.objects.filter(
        content_type__app_label="datastore"
    )
    admin_group.permissions.add(*datastore_permissions)


def revoke_admin_permissions(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")
    admin_group = Group.objects.get(name="admin")
    admin_group.permissions.remove(
        *Permission.objects.filter(content_type__app_label="datastore")
    )


class Migration(migrations.Migration):
    dependencies = [
        ("datastore", "0001_initial"),
        ("authapi", "0001_create_groups"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(grant_admin_permissions, revoke_admin_permissions),
    ]
