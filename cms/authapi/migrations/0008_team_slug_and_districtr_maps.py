"""
Team becomes the tenant (2026-08-05, districtr_v2-i06): give Team a slug —
the stable identifier minted into the JWT `teams` claim — and assign map
modules to teams DIRECTLY (TeamDistrictrMap) instead of through MapGroup,
which returns to being a pure listing facet.

Existing ownership carries over: each TeamMapGroup row expands to one
TeamDistrictrMap row per map in that group (via the backend's
districtrmaps_to_groups table, guarded for isolated cms databases where the
public tables don't exist). TeamMapGroup is then deleted; the reverse cannot
reconstruct group ownership from map ownership, so it only restores schema.
"""

import django.db.models.deletion
import modelcluster.fields
from django.db import migrations, models
from django.utils.text import slugify

from core.migration_utils import ensure_permissions, model_permissions


def backfill_team_slugs(apps, schema_editor):
    Team = apps.get_model("authapi", "Team")
    seen = set()
    for team in Team.objects.order_by("pk"):
        base = slugify(team.name) or f"team-{team.pk}"
        slug, suffix = base, 2
        while slug in seen:
            slug, suffix = f"{base}-{suffix}", suffix + 1
        seen.add(slug)
        team.slug = slug
        team.save(update_fields=["slug"])


def migrate_group_ownership_to_maps(apps, schema_editor):
    TeamMapGroup = apps.get_model("authapi", "TeamMapGroup")
    TeamDistrictrMap = apps.get_model("authapi", "TeamDistrictrMap")
    rows = list(TeamMapGroup.objects.values_list("team_id", "map_group_id"))
    if not rows:
        return
    with schema_editor.connection.cursor() as cursor:
        # to_regclass: NULL (no error, no aborted transaction) when the
        # backend-owned table is absent — e.g. the Django test database.
        cursor.execute("SELECT to_regclass('public.districtrmaps_to_groups')")
        if cursor.fetchone()[0] is None:
            return
        cursor.execute(
            "SELECT group_slug, districtrmap_uuid FROM districtrmaps_to_groups"
        )
        group_to_maps = {}
        for group_slug, map_uuid in cursor.fetchall():
            group_to_maps.setdefault(group_slug, []).append(map_uuid)
    for team_id, group_slug in rows:
        for map_uuid in group_to_maps.get(group_slug, []):
            TeamDistrictrMap.objects.get_or_create(
                team_id=team_id, districtr_map_id=map_uuid
            )


def grant_admin_permissions(apps, schema_editor):
    ensure_permissions("authapi", apps, schema_editor)
    Group = apps.get_model("auth", "Group")
    Group.objects.get(name="admin").permissions.add(
        *model_permissions(apps, "authapi", model="teamdistrictrmap")
    )


def revoke_admin_permissions(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.get(name="admin").permissions.remove(
        *model_permissions(apps, "authapi", model="teamdistrictrmap")
    )


class Migration(migrations.Migration):
    dependencies = [
        ("authapi", "0007_consolidate_partner_groups"),
        ("datastore", "0001_initial"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.AddField(
            model_name="team",
            name="slug",
            # db_index=False: the final AlterField below creates the unique
            # index; an interim plain index would collide on the generated
            # *_like index name.
            field=models.SlugField(max_length=255, null=True, db_index=False),
        ),
        migrations.RunPython(backfill_team_slugs, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="team",
            name="slug",
            field=models.SlugField(
                max_length=255,
                unique=True,
                help_text=(
                    "Stable identifier, minted into members' JWT `teams` claim. "
                    "Changing it revokes group_only gallery access until re-login."
                ),
            ),
        ),
        migrations.CreateModel(
            name="TeamDistrictrMap",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "team",
                    modelcluster.fields.ParentalKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="districtr_maps",
                        to="authapi.team",
                    ),
                ),
                (
                    "districtr_map",
                    models.ForeignKey(
                        db_constraint=False,
                        on_delete=django.db.models.deletion.DO_NOTHING,
                        related_name="team_links",
                        to="datastore.districtrmap",
                    ),
                ),
            ],
            options={
                "unique_together": {("team", "districtr_map")},
            },
        ),
        migrations.RunPython(
            migrate_group_ownership_to_maps, migrations.RunPython.noop
        ),
        migrations.RunPython(grant_admin_permissions, revoke_admin_permissions),
        migrations.DeleteModel(name="TeamMapGroup"),
    ]
