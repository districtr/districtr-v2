"""
Rename Wagtail's stock "Welcome to your new Wagtail site!" home page to
"Districtr". The page itself is structural (a Wagtail site needs a root
page; the content indexes live under it) — only the confusing default title
goes. Reversible.
"""

from django.db import migrations

STOCK_TITLE = "Welcome to your new Wagtail site!"
NEW_TITLE = "Districtr"


def _rename(apps, schema_editor, old, new):
    Page = apps.get_model("wagtailcore", "Page")
    Page.objects.filter(depth=2, title=old).update(title=new, draft_title=new)


def rename_home(apps, schema_editor):
    _rename(apps, schema_editor, STOCK_TITLE, NEW_TITLE)


def restore_home(apps, schema_editor):
    _rename(apps, schema_editor, NEW_TITLE, STOCK_TITLE)


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0010_import_legacy_content"),
    ]

    operations = [
        migrations.RunPython(rename_home, restore_home),
    ]
