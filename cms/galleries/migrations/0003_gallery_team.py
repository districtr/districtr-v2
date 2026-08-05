"""
Galleries belong to a Team, not a MapGroup (2026-08-05, districtr_v2-i06).

The team FK is a real, required constraint (both tables are Django-owned in
the `admin` schema), which also closes districtr_v2-rqz: a group_only
gallery can no longer be ownerless and silently inaccessible. Existing
galleries are re-homed onto a Team derived from their map_group slug (or a
"Districtr" house team when they had none); the map_group column is dropped.
"""

import django.db.models.deletion
from django.db import migrations, models

FALLBACK = ("districtr", "Districtr")


def backfill_gallery_teams(apps, schema_editor):
    Gallery = apps.get_model("galleries", "Gallery")
    Team = apps.get_model("authapi", "Team")
    for gallery in Gallery.objects.all():
        slug = gallery.map_group_id or FALLBACK[0]
        name = slug.replace("-", " ").title() if gallery.map_group_id else FALLBACK[1]
        team, _ = Team.objects.get_or_create(slug=slug, defaults={"name": name})
        gallery.team = team
        gallery.save(update_fields=["team"])


class Migration(migrations.Migration):
    dependencies = [
        ("galleries", "0002_grant_group_permissions"),
        ("authapi", "0008_team_slug_and_districtr_maps"),
    ]

    operations = [
        migrations.AddField(
            model_name="gallery",
            name="team",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="galleries",
                to="authapi.team",
            ),
        ),
        migrations.RunPython(backfill_gallery_teams, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="gallery",
            name="team",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="galleries",
                to="authapi.team",
                help_text=(
                    "Owning team; group_only galleries are visible to its members."
                ),
            ),
        ),
        migrations.RemoveField(model_name="gallery", name="map_group"),
    ]
