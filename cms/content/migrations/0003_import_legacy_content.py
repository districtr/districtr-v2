"""
Import the legacy CMS content (cms.tags_content / cms.places_content) into
Wagtail — as a REVERSIBLE data migration wrapping the migrate_tiptap command.

Forward: no-op when the legacy tables are absent (fresh installs, the Django
test database); otherwise runs the full TipTap conversion. The command is
idempotent, so pages that already match are left untouched.

Author attribution: the legacy `author` column holds Auth0 subjects, which
only a human can map onto provisioned users, and Page.owner is what makes
imported pages editable by their authors under the own-content-only
permission model. This migration therefore REFUSES to import unattended
unless MIGRATE_TIPTAP_OWNERS is set — either to the mapping
("auth0|sub=email@x,...") or to the literal "unowned" to proceed knowingly
with admin-only pages. Otherwise a deploy would silently strip attribution
from every legacy page.

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

import os

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import migrations

LEGACY_TABLES = ("cms.tags_content", "cms.places_content")
UNOWNED = "unowned"


def _legacy_tables_exist(schema_editor) -> bool:
    with schema_editor.connection.cursor() as cursor:
        for table in LEGACY_TABLES:
            # to_regclass: NULL (no error, no aborted transaction) when absent.
            cursor.execute("SELECT to_regclass(%s)", [table])
            if cursor.fetchone()[0] is None:
                return False
    return True


def _legacy_rows_exist(schema_editor) -> bool:
    with schema_editor.connection.cursor() as cursor:
        for table in LEGACY_TABLES:
            cursor.execute(f"SELECT 1 FROM {table} LIMIT 1")  # noqa: S608
            if cursor.fetchone():
                return True
    return False


def import_legacy_content(apps, schema_editor):
    if not _legacy_tables_exist(schema_editor):
        return
    owners = os.environ.get("MIGRATE_TIPTAP_OWNERS", "").strip()
    if not owners and _legacy_rows_exist(schema_editor):
        raise CommandError(
            "Legacy CMS content is present but MIGRATE_TIPTAP_OWNERS is not "
            "set, so the import would leave every page unowned and therefore "
            "uneditable by its author (own-content-only permissions). Set it "
            'to the mapping — MIGRATE_TIPTAP_OWNERS="auth0|sub=email@x,..." — '
            f'or to "{UNOWNED}" to import admin-only pages deliberately.'
        )
    extra = {} if owners in ("", UNOWNED) else {"owners": owners}
    call_command("migrate_tiptap", skip_checks=True, **extra)


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
