"""
Editors edit only their own content (product decision 2026-08-04, resolving
the deferral documented in 0002): revoke the editor group's tree-wide
`change_page`. Wagtail's owner model does the rest — a group holding only
`add_page` on a tree may still edit pages it owns — and the retained
`publish_page` applies only to pages the user can edit, i.e. their own.
Admins keep full-tree permissions. migrate_tiptap sets Page.owner from the
legacy author column so pre-cutover content stays editable by its authors.

Team scoping (authapi/teams.py) composes with this: it further narrows which
pages are *visible/actionable*; ownership now governs which are *editable*.
"""

from django.db import migrations


def _editor_change_page(apps):
    Group = apps.get_model("auth", "Group")
    GroupPagePermission = apps.get_model("wagtailcore", "GroupPagePermission")
    return GroupPagePermission.objects.filter(
        group=Group.objects.get(name="editor"),
        permission__content_type__app_label="wagtailcore",
        permission__content_type__model="page",
        permission__codename="change_page",
    )


def revoke_editor_change_page(apps, schema_editor):
    _editor_change_page(apps).delete()


def restore_editor_change_page(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Page = apps.get_model("wagtailcore", "Page")
    Permission = apps.get_model("auth", "Permission")
    GroupPagePermission = apps.get_model("wagtailcore", "GroupPagePermission")
    GroupPagePermission.objects.get_or_create(
        group=Group.objects.get(name="editor"),
        page=Page.objects.get(pk=1),
        permission=Permission.objects.get(
            content_type__app_label="wagtailcore",
            content_type__model="page",
            codename="change_page",
        ),
    )


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0003_alter_placepage_body_alter_tagpage_body"),
    ]

    operations = [
        migrations.RunPython(revoke_editor_change_page, restore_editor_change_page),
    ]
