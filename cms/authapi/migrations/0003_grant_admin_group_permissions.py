"""
Grant the `admin` group (created by authapi.0001_create_groups) all model
permissions on ReviewTagAssignment so Wagtail's snippet permission policy
lets admins manage review tag scopes.

Editors/reviewers/partners intentionally get NO permissions — the "Review
tag scopes" menu item simply does not appear for them. Reviewers are the
*subjects* of assignments, never the managers.

Follows the datastore/0002 and galleries/0002 pattern.
"""

from django.apps import apps as global_apps
from django.contrib.auth.management import create_permissions
from django.db import migrations


def grant_admin_permissions(apps, schema_editor):
    # Permission rows are normally created by the post_migrate signal, which
    # has not fired yet on a fresh database — create authapi's now.
    create_permissions(
        global_apps.get_app_config("authapi"),
        apps=apps,
        verbosity=0,
        using=schema_editor.connection.alias,
    )

    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")
    admin_group = Group.objects.get(name="admin")
    authapi_permissions = Permission.objects.filter(
        content_type__app_label="authapi",
        content_type__model="reviewtagassignment",
    )
    admin_group.permissions.add(*authapi_permissions)


def revoke_admin_permissions(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")
    admin_group = Group.objects.get(name="admin")
    admin_group.permissions.remove(
        *Permission.objects.filter(
            content_type__app_label="authapi",
            content_type__model="reviewtagassignment",
        )
    )


class Migration(migrations.Migration):
    dependencies = [
        ("authapi", "0002_reviewtagassignment"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(grant_admin_permissions, revoke_admin_permissions),
    ]
