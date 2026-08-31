# State-only migration for the managed=False FormFieldCustom mirror
# (comments.form_fields_custom, backend Alembic revision e4a7c318b9d2).

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("datastore", "0004_formconfig_collection_mode"),
    ]

    operations = [
        migrations.CreateModel(
            name="FormFieldCustom",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("key", models.CharField(blank=True, max_length=64)),
                ("label", models.CharField(max_length=255)),
                (
                    "field_type",
                    models.CharField(
                        choices=[("text", "Short answer"), ("textarea", "Paragraph")],
                        default="text",
                        max_length=16,
                    ),
                ),
                ("required", models.BooleanField(default=False)),
                ("sort_order", models.IntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "form_config",
                    models.ForeignKey(
                        db_column="portal_id",
                        db_constraint=False,
                        on_delete=django.db.models.deletion.DO_NOTHING,
                        related_name="custom_fields",
                        to="datastore.formconfig",
                        to_field="portal_id",
                    ),
                ),
            ],
            options={
                "db_table": 'comments"."form_fields_custom',
                "managed": False,
                "ordering": ["sort_order", "id"],
                "verbose_name": "custom question",
                "verbose_name_plural": "custom questions",
            },
        ),
    ]
