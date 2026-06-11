"""
Grant the `admin` group (created by authapi.0001_create_groups) all model
permissions on ReviewTagAssignment so Wagtail's snippet permission policy
lets admins manage review tag scopes.

Editors/reviewers/partners intentionally get NO permissions — the "Review
tag scopes" menu item simply does not appear for them. Reviewers are the
*subjects* of assignments, never the managers.

Follows the datastore/0002 and galleries/0002 pattern.
"""

from django.db import migrations

from core.migration_utils import ensure_permissions, model_permissions


def grant_admin_permissions(apps, schema_editor):
    # post_migrate hasn't fired on a fresh DB; materialize authapi's rows.
    ensure_permissions("authapi", apps, schema_editor)

    Group = apps.get_model("auth", "Group")
    admin_group = Group.objects.get(name="admin")
    admin_group.permissions.add(
        *model_permissions(apps, "authapi", model="reviewtagassignment")
    )


def revoke_admin_permissions(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    admin_group = Group.objects.get(name="admin")
    admin_group.permissions.remove(
        *model_permissions(apps, "authapi", model="reviewtagassignment")
    )


class Migration(migrations.Migration):
    dependencies = [
        ("authapi", "0002_reviewtagassignment"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(grant_admin_permissions, revoke_admin_permissions),
    ]
