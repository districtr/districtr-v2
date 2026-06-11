"""
Grant the `admin` group all model permissions on Team and its inline children
(TeamMembership, TeamMapGroup) so the "Teams" snippet is manageable by admins.

Only `admin` manages teams; members are the *subjects* of teams, never the
managers — so editors/reviewers/partners get nothing and the "Teams" menu item
simply does not render for them. Follows the authapi/0003 pattern via
core.migration_utils.
"""

from django.db import migrations

from core.migration_utils import ensure_permissions, model_permissions

TEAM_MODELS = ["team", "teammembership", "teammapgroup"]


def grant_admin_permissions(apps, schema_editor):
    # post_migrate hasn't fired on a fresh DB; materialize authapi's rows.
    ensure_permissions("authapi", apps, schema_editor)

    Group = apps.get_model("auth", "Group")
    admin_group = Group.objects.get(name="admin")
    for model in TEAM_MODELS:
        admin_group.permissions.add(*model_permissions(apps, "authapi", model=model))


def revoke_admin_permissions(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    admin_group = Group.objects.get(name="admin")
    for model in TEAM_MODELS:
        admin_group.permissions.remove(*model_permissions(apps, "authapi", model=model))


class Migration(migrations.Migration):
    dependencies = [
        ("authapi", "0004_team_teammapgroup_teammembership"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(grant_admin_permissions, revoke_admin_permissions),
    ]
