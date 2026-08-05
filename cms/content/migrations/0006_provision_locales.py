"""
Pre-provision a Locale row per configured content language. Previously only
migrate_tiptap created them lazily, so a fresh site couldn't translate pages
until the legacy import ran. Reverse is a no-op: deleting a Locale cascades
to its pages.
"""

from django.conf import settings
from django.db import migrations


def create_locales(apps, schema_editor):
    Locale = apps.get_model("wagtailcore", "Locale")
    for language_code, _name in settings.WAGTAIL_CONTENT_LANGUAGES:
        Locale.objects.get_or_create(language_code=language_code)


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0005_static_pages"),
    ]

    operations = [
        migrations.RunPython(create_locales, migrations.RunPython.noop),
    ]
