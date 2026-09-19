from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from datastore.drift import (
    EXCLUDED_COLUMNS,
    compare_columns,
    mirrored_models,
    model_column_spec,
)

COLUMNS_QUERY = """
    SELECT column_name, is_nullable = 'YES'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = %s
"""


class Command(BaseCommand):
    help = (
        "Compare the managed=False mirrors in datastore.models against the "
        "live Alembic-owned tables in the `public` schema (column names and "
        "nullability). Exits non-zero with a readable diff on any drift."
    )

    def handle(self, *args, **options):
        problems = []
        checked = 0
        with connection.cursor() as cursor:
            for model in mirrored_models():
                table = model._meta.db_table
                cursor.execute(COLUMNS_QUERY, [table])
                db_spec = dict(cursor.fetchall())
                if not db_spec:
                    problems.append(
                        f"{table}: not found in the `public` schema "
                        "(have the backend Alembic migrations run?)"
                    )
                    continue
                problems.extend(
                    compare_columns(
                        table,
                        model_column_spec(model),
                        db_spec,
                        EXCLUDED_COLUMNS.get(table, frozenset()),
                    )
                )
                checked += 1
        if problems:
            details = "\n".join(f"  - {problem}" for problem in problems)
            raise CommandError(
                "Mirror drift detected between datastore.models and the "
                f"database:\n{details}\n"
                "Update the mirrors (and backend/app/models.py notes) or add "
                "intentional exclusions to datastore.drift.EXCLUDED_COLUMNS."
            )
        self.stdout.write(
            self.style.SUCCESS(
                f"All {checked} mirrored models match the live public schema."
            )
        )
