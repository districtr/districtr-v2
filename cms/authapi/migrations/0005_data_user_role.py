"""
Provision the ``data_user`` role: Wagtail admin access and nothing else.

Its one capability is the data-extract token (authapi/views.py::extract_token),
gated on group membership rather than a Django permission. Reverse deletes the
group.
"""

from django.db import migrations


def provision(apps, schema_editor):
    # access_admin is created by the wagtailadmin migration itself, so no
    # ensure_permissions() is needed (see core/migration_utils).
    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")
    group, _ = Group.objects.get_or_create(name="data_user")
    group.permissions.add(
        Permission.objects.get(
            content_type__app_label="wagtailadmin", codename="access_admin"
        )
    )


def remove(apps, schema_editor):
    apps.get_model("auth", "Group").objects.filter(name="data_user").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("authapi", "0004_scope_partner_add_page"),
        ("wagtailadmin", "0001_create_admin_access_permissions"),
    ]

    operations = [migrations.RunPython(provision, remove)]
