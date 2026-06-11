"""
Permission split for the gallery curation flow (partners draft, editors
publish):

- `partner`: add + change Gallery only. Wagtail's snippet permission policy
  shows them the Galleries menu and the editor, but DraftStateMixin gates the
  Publish action on the extra `publish_gallery` permission — so partners can
  only "Save draft". (GalleryEntry needs no permissions of its own: InlinePanel
  children are saved through the parent via modelcluster.)
- `editor` and `admin`: every Gallery/GalleryEntry model permission PLUS
  `publish_gallery`. The publish permission row is normally created by
  wagtail.snippets' post_migrate hook (create_extra_permissions) because
  Gallery uses DraftStateMixin; on a fresh database that hook has not fired
  yet, so this migration creates the row itself.
- `wagtailadmin.access_admin` for all four groups: Wagtail gates admin login
  on it and no earlier migration granted it (datastore.0002 only granted
  datastore model perms to `admin`; provision_users expects it "granted per
  group in later migrations" — this is that migration).
"""

from django.apps import apps as global_apps
from django.contrib.auth.management import create_permissions
from django.db import migrations

GROUPS = ["admin", "editor", "reviewer", "partner"]
PUBLISHER_GROUPS = ["admin", "editor"]
PARTNER_PERMISSIONS = ["add_gallery", "change_gallery"]


def _galleries_permissions(apps, schema_editor):
    """All gallery permission rows, creating any that post_migrate would."""
    create_permissions(
        global_apps.get_app_config("galleries"),
        apps=apps,
        verbosity=0,
        using=schema_editor.connection.alias,
    )

    ContentType = apps.get_model("contenttypes", "ContentType")
    Permission = apps.get_model("auth", "Permission")
    gallery_ct = ContentType.objects.get(app_label="galleries", model="gallery")
    Permission.objects.get_or_create(
        content_type=gallery_ct,
        codename="publish_gallery",
        defaults={"name": "Can publish gallery"},
    )
    return Permission.objects.filter(content_type__app_label="galleries")


def grant_group_permissions(apps, schema_editor):
    permissions = _galleries_permissions(apps, schema_editor)

    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")

    for name in PUBLISHER_GROUPS:
        Group.objects.get(name=name).permissions.add(*permissions)
    Group.objects.get(name="partner").permissions.add(
        *permissions.filter(codename__in=PARTNER_PERMISSIONS)
    )

    access_admin = Permission.objects.get(
        content_type__app_label="wagtailadmin", codename="access_admin"
    )
    for name in GROUPS:
        Group.objects.get(name=name).permissions.add(access_admin)


def revoke_group_permissions(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")
    revoked = list(
        Permission.objects.filter(content_type__app_label="galleries")
    ) + list(
        Permission.objects.filter(
            content_type__app_label="wagtailadmin", codename="access_admin"
        )
    )
    for group in Group.objects.filter(name__in=GROUPS):
        group.permissions.remove(*revoked)


class Migration(migrations.Migration):
    dependencies = [
        ("galleries", "0001_initial"),
        ("authapi", "0001_create_groups"),
        ("contenttypes", "0002_remove_content_type_name"),
        ("wagtailadmin", "0001_create_admin_access_permissions"),
    ]

    operations = [
        migrations.RunPython(grant_group_permissions, revoke_group_permissions),
    ]
