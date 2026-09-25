# State-only migration for the managed=False FormConfig mirror
# (comments.form_configs, owned by backend Alembic revision c7e2a94d81f5).

import django.contrib.postgres.fields
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("datastore", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="FormConfig",
            fields=[
                ("id", models.AutoField(primary_key=True, serialize=False)),
                ("portal_id", models.CharField(unique=True)),
                ("name", models.CharField()),
                (
                    "fields",
                    django.contrib.postgres.fields.ArrayField(
                        base_field=models.CharField(max_length=64),
                        default=list,
                        size=None,
                    ),
                ),
                (
                    "required_fields",
                    django.contrib.postgres.fields.ArrayField(
                        base_field=models.CharField(max_length=64),
                        default=list,
                        size=None,
                    ),
                ),
                ("require_email_confirm", models.BooleanField(default=False)),
                (
                    "admin_teams",
                    django.contrib.postgres.fields.ArrayField(
                        base_field=models.CharField(max_length=255),
                        default=list,
                        size=None,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": 'comments"."form_configs',
                "managed": False,
                "verbose_name": "portal form",
                "verbose_name_plural": "portal forms",
            },
        ),
    ]
