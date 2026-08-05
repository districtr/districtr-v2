"""
Consolidate the four launch groups into the roles the management system
actually has (product decision 2026-08-05): `partner`, `super_partner`,
`admin`.

- `partner` absorbs `editor` + `reviewer`: members are moved over, and the
  group gains root `add_page` (own-content editing via Wagtail's owner model,
  the same shape content.0004 set up) on top of its existing gallery drafting
  + admin access. Comment moderation comes from the partner scopes in
  authapi/scopes.py; per-user tag limits stay on ReviewTagAssignment.
  No `publish_page`: partner publishes go through admin review/approval.
- `super_partner` is new: everything partner has, plus the datastore
  permissions gating the map-module tools — compose map, upload overlay, and
  module/overlay snippet editing. GPKG import deliberately stays admin-only
  (it requires `add_gerrydbtable`, which only admin holds).
- `editor` and `reviewer` are deleted (cascading their permission and
  page-permission rows).

Reverse recreates editor/reviewer with their historical grants and drops
super_partner, but memberships are not restored — that information is lost.
"""

from django.db import migrations

from core.migration_utils import ensure_permissions, model_permissions

RETIRED_GROUPS = ["editor", "reviewer"]

PARTNER_TIER_GALLERY_PERMISSIONS = ["add_gallery", "change_gallery"]

SUPER_PARTNER_DATASTORE_GRANTS = {
    "districtrmap": ["add", "change", "view"],
    "overlay": ["add", "change", "view"],
    "districtrmapoverlays": ["add", "change", "view"],
    "gerrydbtable": ["view"],
}


def _page_permission(apps, codename):
    Permission = apps.get_model("auth", "Permission")
    return Permission.objects.get(
        content_type__app_label="wagtailcore",
        content_type__model="page",
        codename=codename,
    )


def consolidate_groups(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")
    Page = apps.get_model("wagtailcore", "Page")
    GroupPagePermission = apps.get_model("wagtailcore", "GroupPagePermission")

    partner = Group.objects.get(name="partner")
    super_partner, _ = Group.objects.get_or_create(name="super_partner")

    # Members of the retired groups become partners.
    for name in RETIRED_GROUPS:
        for user in Group.objects.get(name=name).user_set.all():
            user.groups.add(partner)

    # Pages: root add_page only — the owner model makes owned pages editable,
    # and publishing goes through admin approval, not a publish permission.
    root = Page.objects.get(pk=1)
    add_page = _page_permission(apps, "add_page")
    for group in (partner, super_partner):
        GroupPagePermission.objects.get_or_create(
            group=group, page=root, permission=add_page
        )

    # super_partner: the partner tier (admin access, gallery drafting)...
    ensure_permissions("galleries", apps, schema_editor)
    super_partner.permissions.add(
        *model_permissions(apps, "galleries").filter(
            codename__in=PARTNER_TIER_GALLERY_PERMISSIONS
        )
    )
    super_partner.permissions.add(
        Permission.objects.get(
            content_type__app_label="wagtailadmin", codename="access_admin"
        )
    )

    # ...plus the datastore tool permissions (datastore/views.py gates:
    # add_districtrmap = compose/thumbnails, add_overlay = upload overlay).
    ensure_permissions("datastore", apps, schema_editor)
    for model, actions in SUPER_PARTNER_DATASTORE_GRANTS.items():
        super_partner.permissions.add(
            *model_permissions(apps, "datastore", model=model).filter(
                codename__in=[f"{action}_{model}" for action in actions]
            )
        )

    Group.objects.filter(name__in=RETIRED_GROUPS).delete()


def split_groups_back(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")
    Page = apps.get_model("wagtailcore", "Page")
    GroupPagePermission = apps.get_model("wagtailcore", "GroupPagePermission")

    editor, _ = Group.objects.get_or_create(name="editor")
    reviewer, _ = Group.objects.get_or_create(name="reviewer")

    # Historical post-0004 state: editor holds root add_page + publish_page
    # and the full gallery permission set; reviewer holds admin access only.
    root = Page.objects.get(pk=1)
    for codename in ("add_page", "publish_page"):
        GroupPagePermission.objects.get_or_create(
            group=editor, page=root, permission=_page_permission(apps, codename)
        )
    ensure_permissions("galleries", apps, schema_editor)
    editor.permissions.add(*model_permissions(apps, "galleries"))
    access_admin = Permission.objects.get(
        content_type__app_label="wagtailadmin", codename="access_admin"
    )
    editor.permissions.add(access_admin)
    reviewer.permissions.add(access_admin)

    GroupPagePermission.objects.filter(
        group__name__in=["partner", "super_partner"]
    ).delete()
    Group.objects.filter(name="super_partner").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("authapi", "0006_remove_team_slug"),
        # Page-permission and group-permission state this transforms.
        ("content", "0004_editor_own_content_only"),
        ("galleries", "0002_grant_group_permissions"),
        ("datastore", "0002_grant_admin_group_permissions"),
        ("wagtailcore", "0002_initial_data"),
        ("wagtailadmin", "0001_create_admin_access_permissions"),
    ]

    operations = [
        migrations.RunPython(consolidate_groups, split_groups_back),
    ]
