# State-only: collection_mode on the managed=False FormConfig mirror
# (backend Alembic revision e4a7c318b9d2 owns the DDL).

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("datastore", "0003_grant_formconfig_permissions"),
    ]

    operations = [
        migrations.AddField(
            model_name="formconfig",
            name="collection_mode",
            field=models.CharField(default="prompt", max_length=16),
        ),
    ]
