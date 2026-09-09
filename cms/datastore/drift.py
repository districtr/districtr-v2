"""
Schema-drift detection for the managed=False mirrors in datastore.models.

Alembic (backend/) owns the DDL for these tables; the Django models here are
hand-maintained mirrors. `manage.py check_mirror_drift` compares each
mirror's concrete fields against information_schema.columns and fails loudly
when the backend schema has moved on. The comparison itself is a pure
function (`compare_columns`) so it can be unit-tested against fake snapshots.
"""

from django.apps import apps

# Columns that exist in the database but are intentionally NOT mapped on the
# Django side, keyed by db_table. Geometry columns are the canonical example:
# they must never be mirrored (no GeoDjango here). None of the current six
# mirrors carry geometry, so the sets are empty — add to them deliberately,
# never to paper over real drift.
EXCLUDED_COLUMNS: dict[str, frozenset[str]] = {
    "districtrmap": frozenset(),
    "gerrydbtable": frozenset(),
    "map_group": frozenset(),
    "districtrmaps_to_groups": frozenset(),
    "districtrmap_overlays": frozenset(),
    "overlay": frozenset(),
}


def mirrored_models():
    """All unmanaged (mirror) models registered by the datastore app."""
    return [
        model
        for model in apps.get_app_config("datastore").get_models()
        if not model._meta.managed
    ]


def model_column_spec(model) -> dict[str, bool]:
    """Map of column name -> null allowed, from the model's concrete fields."""
    return {field.column: field.null for field in model._meta.local_concrete_fields}


def compare_columns(
    table: str,
    model_spec: dict[str, bool],
    db_spec: dict[str, bool],
    excluded: frozenset[str] = frozenset(),
) -> list[str]:
    """
    Pure comparison of a model's column spec against a database snapshot.

    Both specs map column name -> null allowed. Returns a list of
    human-readable problem lines; an empty list means the mirror is in sync.
    """
    problems = []
    relevant_db = {col: null for col, null in db_spec.items() if col not in excluded}
    for col in sorted(set(relevant_db) - set(model_spec)):
        problems.append(
            f"{table}.{col}: present in the database but not mapped on the model"
        )
    for col in sorted(set(model_spec) - set(relevant_db)):
        problems.append(
            f"{table}.{col}: mapped on the model but missing from the database"
        )
    for col in sorted(set(model_spec) & set(relevant_db)):
        if model_spec[col] != relevant_db[col]:
            db_null = "NULL" if relevant_db[col] else "NOT NULL"
            model_null = f"null={model_spec[col]}"
            problems.append(
                f"{table}.{col}: nullability mismatch "
                f"(database says {db_null}, model says {model_null})"
            )
    return problems
