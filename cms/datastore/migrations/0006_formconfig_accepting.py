# State-only: accepting on the managed=False FormConfig mirror
# (backend Alembic revision a7c2e9d4b150 owns the DDL).

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("datastore", "0005_formfieldcustom"),
    ]

    operations = [
        migrations.AddField(
            model_name="formconfig",
            name="accepting",
            field=models.BooleanField(default=False, editable=False),
        ),
    ]
