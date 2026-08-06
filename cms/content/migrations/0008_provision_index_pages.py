"""
Provision the Tags / Places / Static index pages under the site home.

Previously TagsIndexPage/PlacesIndexPage were only created as a side effect
of `manage.py migrate_tiptap`, and StaticIndexPage was a manual checklist
step. Uses the shared content.provision helpers (real models — the treebeard
page tree cannot be manipulated through migration-state models; the index
page classes carry no fields beyond Page, so historical divergence is not a
concern). Reverse is a no-op: deleting provisioned pages would cascade to
any content created under them.
"""

from django.db import migrations


def create_index_pages(apps, schema_editor):
    from content.provision import ensure_default_index_pages

    ensure_default_index_pages()


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0007_admin_approval_workflow"),
        # Default Site + home page (root of the provisioned index pages).
        ("wagtailcore", "0002_initial_data"),
    ]

    operations = [
        migrations.RunPython(create_index_pages, migrations.RunPython.noop),
    ]
