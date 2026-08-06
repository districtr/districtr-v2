"""
Import the legacy CMS content (cms.tags_content / cms.places_content) into
Wagtail — as a REVERSIBLE data migration wrapping the migrate_tiptap command.

Forward: no-op when the legacy tables are absent (fresh installs, the Django
test database); otherwise runs the full TipTap conversion. The command is
idempotent, so pages that already match are left untouched.

Reverse: deletes every TagPage/PlacePage translation whose (slug, language)
matches a legacy row — INCLUDING any edits made to those pages after the
import. Pages with no legacy counterpart (hand-created portals, StaticPages)
are untouched.

Both directions use LIVE models rather than migration-state models: the
command builds StreamField content and page deletion needs the treebeard
tree API, neither of which works on historical models. That is safe while
this migration sits at (or near) the head of content's history; if content's
models change shape substantially later, squash rather than replaying this
from scratch.
"""

from django.core.management import call_command
from django.db import migrations

LEGACY_TABLES = ("cms.tags_content", "cms.places_content")


def _legacy_tables_exist(schema_editor) -> bool:
    with schema_editor.connection.cursor() as cursor:
        for table in LEGACY_TABLES:
            # to_regclass: NULL (no error, no aborted transaction) when absent.
            cursor.execute("SELECT to_regclass(%s)", [table])
            if cursor.fetchone()[0] is None:
                return False
    return True


def import_legacy_content(apps, schema_editor):
    if not _legacy_tables_exist(schema_editor):
        return
    call_command("migrate_tiptap", skip_checks=True)


def remove_imported_content(apps, schema_editor):
    if not _legacy_tables_exist(schema_editor):
        return
    from content.models import PlacePage, TagPage

    with schema_editor.connection.cursor() as cursor:
        cursor.execute("SELECT slug, language FROM cms.tags_content")
        tag_rows = cursor.fetchall()
        cursor.execute("SELECT slug, language FROM cms.places_content")
        place_rows = cursor.fetchall()

    for model, rows in ((TagPage, tag_rows), (PlacePage, place_rows)):
        for slug, language in rows:
            page = model.objects.filter(
                slug=slug, locale__language_code=language
            ).first()
            if page is not None:
                page.delete()


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0002_provision_site"),
    ]

    operations = [
        migrations.RunPython(import_legacy_content, remove_imported_content),
    ]
