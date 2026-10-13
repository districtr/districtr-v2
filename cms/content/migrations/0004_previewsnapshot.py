import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0003_import_legacy_content"),
    ]

    operations = [
        migrations.CreateModel(
            name="PreviewSnapshot",
            fields=[
                (
                    "token",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("data", models.JSONField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
    ]
