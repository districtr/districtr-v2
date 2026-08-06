"""
Provision the three roles (final state, squashed 2026-08-06 from the
iterative authapi/content/datastore/galleries grant migrations of the
first-pass branch — no deployment ever ran the intermediate states):

- ``admin``: Wagtail admin access; full page permissions on the root
  (add/change/publish/lock/unlock); every datastore model permission; the
  Team-management model permissions.
- ``partner``: admin access; root ``add_page`` only — own-content editing
  via Wagtail's owner model, publishing via the admin-approval workflow
  (content/0002). Comment moderation comes from scopes (authapi/scopes.py),
  not Django permissions.
- ``super_partner``: everything partner has, plus the map-module tool
  permissions — DistrictrMap/Overlay/DistrictrMapOverlays add+change+view
  and GerryDBTable view. GPKG import needs ``add_gerrydbtable``: admin only.

Reverse deletes the groups (cascading their grants and page permissions).
"""

from django.db import migrations

from core.migration_utils import ensure_permissions, model_permissions

GROUPS = ["admin", "partner", "super_partner"]

ADMIN_PAGE_PERMS = ["add_page", "change_page", "publish_page", "lock_page", "unlock_page"]
PARTNER_PAGE_PERMS = ["add_page"]

SUPER_PARTNER_DATASTORE_GRANTS = {
    "districtrmap": ["add", "change", "view"],
    "overlay": ["add", "change", "view"],
    "districtrmapoverlays": ["add", "change", "view"],
    "gerrydbtable": ["view"],
}

TEAM_MODELS = ["team", "teammembership", "teamdistrictrmap"]


def _page_permissions(apps, codenames):
    Permission = apps.get_model("auth", "Permission")
    return Permission.objects.filter(
        content_type__app_label="wagtailcore",
        content_type__model="page",
        codename__in=codenames,
    )


def provision_roles(apps, schema_editor):
    # post_migrate hasn't fired on a fresh database: materialize the
    # Permission rows this migration grants (core/migration_utils docs the
    # footgun), including wagtailcore's custom publish/lock/unlock page perms.
    for app_label in ("wagtailcore", "datastore", "authapi"):
        ensure_permissions(app_label, apps, schema_editor)

    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")
    Page = apps.get_model("wagtailcore", "Page")
    GroupPagePermission = apps.get_model("wagtailcore", "GroupPagePermission")

    groups = {name: Group.objects.get_or_create(name=name)[0] for name in GROUPS}

    access_admin = Permission.objects.get(
        content_type__app_label="wagtailadmin", codename="access_admin"
    )
    for group in groups.values():
        group.permissions.add(access_admin)

    # Page permissions are tree-scoped GroupPagePermission rows on the root
    # (id=1, wagtailcore.0002_initial_data), NOT Django model permissions.
    root = Page.objects.get(pk=1)
    grants = {
        "admin": ADMIN_PAGE_PERMS,
        "partner": PARTNER_PAGE_PERMS,
        "super_partner": PARTNER_PAGE_PERMS,
    }
    for name, codenames in grants.items():
        for permission in _page_permissions(apps, codenames):
            GroupPagePermission.objects.get_or_create(
                group=groups[name], page=root, permission=permission
            )

    groups["admin"].permissions.add(*model_permissions(apps, "datastore"))
    for model, actions in SUPER_PARTNER_DATASTORE_GRANTS.items():
        groups["super_partner"].permissions.add(
            *model_permissions(apps, "datastore", model=model).filter(
                codename__in=[f"{action}_{model}" for action in actions]
            )
        )

    for model in TEAM_MODELS:
        groups["admin"].permissions.add(
            *model_permissions(apps, "authapi", model=model)
        )


def remove_roles(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.filter(name__in=GROUPS).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("authapi", "0001_initial"),
        ("datastore", "0001_initial"),
        ("auth", "0012_alter_user_first_name_max_length"),
        ("contenttypes", "0002_remove_content_type_name"),
        ("wagtailadmin", "0001_create_admin_access_permissions"),
        # 0002_initial_data for the root page; 0094 pins the modern
        # GroupPagePermission shape (permission FK, not permission_type).
        ("wagtailcore", "0094_alter_page_locale"),
    ]

    operations = [
        migrations.RunPython(provision_roles, remove_roles),
    ]
