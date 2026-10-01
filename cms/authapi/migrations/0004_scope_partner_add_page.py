"""Move the partner groups' add_page grant from the tree root to the Portals
and Places index pages (every locale).

At the root, the grant let a partner who reached the page explorer by URL add
children under Static pages or the site home. Partners only create portals
(the wizard) and place pages. The grant can't be dropped outright: editing a
page you own also needs add permission on an ancestor.
"""

from django.db import migrations

PARTNER_GROUPS = ("partner", "super_partner")


def _add_page(apps):
    Permission = apps.get_model("auth", "Permission")
    return Permission.objects.get(
        content_type__app_label="wagtailcore", codename="add_page"
    )


def _index_page_ids(apps):
    ids = []
    for model in ("PortalsIndexPage", "PlacesIndexPage"):
        ids += list(
            apps.get_model("content", model).objects.values_list("pk", flat=True)
        )
    return ids


def scope_to_indexes(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    GroupPagePermission = apps.get_model("wagtailcore", "GroupPagePermission")
    add_page = _add_page(apps)
    groups = Group.objects.filter(name__in=PARTNER_GROUPS)
    GroupPagePermission.objects.filter(
        group__in=groups, page_id=1, permission=add_page
    ).delete()
    for group in groups:
        for page_id in _index_page_ids(apps):
            GroupPagePermission.objects.get_or_create(
                group=group, page_id=page_id, permission=add_page
            )


def restore_root_grant(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    GroupPagePermission = apps.get_model("wagtailcore", "GroupPagePermission")
    add_page = _add_page(apps)
    groups = Group.objects.filter(name__in=PARTNER_GROUPS)
    GroupPagePermission.objects.filter(
        group__in=groups, page_id__in=_index_page_ids(apps), permission=add_page
    ).delete()
    for group in groups:
        GroupPagePermission.objects.get_or_create(
            group=group, page_id=1, permission=add_page
        )


class Migration(migrations.Migration):
    dependencies = [
        ("authapi", "0003_alter_team_slug"),
        ("content", "0006_rename_tagpage_to_portalpage"),
        ("wagtailcore", "0094_alter_page_locale"),
    ]

    operations = [migrations.RunPython(scope_to_indexes, restore_root_grant)]
