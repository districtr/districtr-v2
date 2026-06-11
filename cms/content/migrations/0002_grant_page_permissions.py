"""
Grant the `editor` and `admin` groups (created by authapi.0001_create_groups)
page permissions on the ROOT page so Wagtail's PagePermissionPolicy lets them
into the Pages explorer at all. Wagtail page permissions are tree-scoped
GroupPagePermission rows, NOT Django model permissions — without any rows the
explorer is hidden entirely and editors cannot edit ANY content pages.

Grants (on the root page, id=1, created by wagtailcore.0002_initial_data, so
they cascade to the whole tree):

- editor: add_page, change_page, publish_page
- admin:  add_page, change_page, publish_page (+ lock_page/unlock_page where
  those permission rows exist)

Product decision deferred: the legacy own-content-only editing distinction
(update:content vs update:update-all scopes) is NOT recreated here — all
editors can edit all pages. The Wagtail-native way to restore it later is an
owner-based model: grant editors add_page only (an "add"-only group may still
edit pages it owns) and reserve change_page/publish_page for admins.

Reversible: the reverse operation deletes exactly the rows this migration
creates.
"""

from django.apps import apps as global_apps
from django.contrib.auth.management import create_permissions
from django.db import migrations

GRANTS = {
    "editor": ["add_page", "change_page", "publish_page"],
    "admin": [
        "add_page",
        "change_page",
        "publish_page",
        "lock_page",
        "unlock_page",
    ],
}


def _page_permissions(apps, codenames):
    Permission = apps.get_model("auth", "Permission")
    return Permission.objects.filter(
        content_type__app_label="wagtailcore",
        content_type__model="page",
        codename__in=codenames,
    )


def grant_page_permissions(apps, schema_editor):
    # Permission rows are normally created by the post_migrate signal, which
    # has not fired yet on a fresh database — create wagtailcore's now (this
    # includes the custom publish/lock/unlock permissions from
    # Page.Meta.permissions). Same pattern as authapi.0003.
    create_permissions(
        global_apps.get_app_config("wagtailcore"),
        apps=apps,
        verbosity=0,
        using=schema_editor.connection.alias,
    )

    Group = apps.get_model("auth", "Group")
    Page = apps.get_model("wagtailcore", "Page")
    GroupPagePermission = apps.get_model("wagtailcore", "GroupPagePermission")

    # The root page always exists: wagtailcore.0002_initial_data creates it.
    root = Page.objects.get(pk=1)

    for group_name, codenames in GRANTS.items():
        group = Group.objects.get(name=group_name)
        # lock_page/unlock_page may be absent on exotic databases; grant
        # whatever subset of the requested permission rows exists.
        for permission in _page_permissions(apps, codenames):
            GroupPagePermission.objects.get_or_create(
                group=group, page=root, permission=permission
            )


def revoke_page_permissions(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Page = apps.get_model("wagtailcore", "Page")
    GroupPagePermission = apps.get_model("wagtailcore", "GroupPagePermission")

    root = Page.objects.get(pk=1)
    for group_name, codenames in GRANTS.items():
        GroupPagePermission.objects.filter(
            group=Group.objects.get(name=group_name),
            page=root,
            permission__in=_page_permissions(apps, codenames),
        ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0001_initial"),
        ("authapi", "0001_create_groups"),
        # Root page. (The GroupPagePermission.permission FK shape is pinned
        # transitively: content.0001 depends on wagtailcore.0094.)
        ("wagtailcore", "0002_initial_data"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(grant_page_permissions, revoke_page_permissions),
    ]
