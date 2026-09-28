from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = (
        "Create the dedicated `admin` Postgres schema that holds all "
        "Django/Wagtail-owned tables. Must run before the first `migrate` "
        "(django_migrations itself lands in this schema via search_path)."
    )

    def handle(self, *args, **options):
        with connection.cursor() as cursor:
            cursor.execute('CREATE SCHEMA IF NOT EXISTS "admin"')
        self.stdout.write(self.style.SUCCESS("Schema `admin` is present."))
