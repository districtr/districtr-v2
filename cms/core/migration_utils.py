"""
Shared helpers for the data migrations that grant Django **model** permissions
to the auth Groups created by authapi.0001_create_groups (datastore.0002,
galleries.0002, authapi.0003 — extracted here before a fourth app copies the
pattern).

The footgun these hide: on a FRESH database the post_migrate signal that
normally creates Permission rows has not fired when a data migration runs, so
any migration that grants permissions must first materialize its app's rows by
calling create_permissions() — forgetting to do so makes the grant a silent
no-op (the queryset is empty) on a clean install but not on an existing one.

These operate on the historical models passed to a RunPython function (the
`apps` registry), so they are safe to call from any migration.
"""

from django.apps import apps as global_apps
from django.contrib.auth.management import create_permissions


def ensure_permissions(app_label, apps, schema_editor):
    """Materialize an app's Permission rows if post_migrate hasn't yet.

    Idempotent — create_permissions only inserts rows that don't already exist,
    so this is safe on both fresh and existing databases.
    """
    create_permissions(
        global_apps.get_app_config(app_label),
        apps=apps,
        verbosity=0,
        using=schema_editor.connection.alias,
    )


def model_permissions(apps, app_label, *, model=None):
    """Permission queryset for an app, optionally narrowed to one model."""
    Permission = apps.get_model("auth", "Permission")
    queryset = Permission.objects.filter(content_type__app_label=app_label)
    if model is not None:
        queryset = queryset.filter(content_type__model=model)
    return queryset
