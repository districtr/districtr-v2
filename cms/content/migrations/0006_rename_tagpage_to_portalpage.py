"""TagPage -> PortalPage, TagsIndexPage -> PortalsIndexPage.

The UI, URLs and hub all say "portal", while "tags" also named an unrelated
submissions field. The tables keep their old names: content/0002 provisions
index pages with the live models, so on a fresh database those models must
name the tables that exist when 0002 runs. Pinning db_table first makes each
RenameModel a state-only change. Django's contenttypes app renames the
ContentType rows, so existing pages keep resolving to their specific class.
No model permissions or foreign keys reference either model.

The index page keeps its slug ("tags"): it only shapes Wagtail's internal
url_path, the frontend routes portals at /portal/<slug>, and changing it
would rewrite every descendant's url_path. Its title becomes "Portals" where
it still carries the provisioned default.
"""

from django.db import migrations, models


def retitle_index(apps, schema_editor):
    PortalsIndexPage = apps.get_model("content", "PortalsIndexPage")
    PortalsIndexPage.objects.filter(title="Tags").update(
        title="Portals", draft_title="Portals"
    )


def untitle_index(apps, schema_editor):
    # Reverse runs against the post-rename state, so the model is still
    # PortalsIndexPage here; the RenameModel reversals come after.
    PortalsIndexPage = apps.get_model("content", "PortalsIndexPage")
    PortalsIndexPage.objects.filter(title="Portals").update(
        title="Tags", draft_title="Tags"
    )


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0005_form_block_drops_mandatory_tags"),
        ("wagtailcore", "0094_alter_page_locale"),
    ]

    operations = [
        migrations.AlterModelTable(name="tagpage", table="content_tagpage"),
        migrations.AlterModelTable(name="tagsindexpage", table="content_tagsindexpage"),
        migrations.RenameModel(old_name="TagPage", new_name="PortalPage"),
        migrations.RenameModel(old_name="TagsIndexPage", new_name="PortalsIndexPage"),
        migrations.AlterModelOptions(
            name="portalpage", options={"verbose_name": "portal page"}
        ),
        migrations.AlterModelOptions(
            name="portalsindexpage", options={"verbose_name": "portals index page"}
        ),
        migrations.AlterField(
            model_name="portalpage",
            name="districtr_map_slug",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Slug of the Districtr map module this portal features.",
                max_length=255,
            ),
        ),
        migrations.RunPython(retitle_index, untitle_index),
    ]
