"""Dev settings with a second test-database name, so two agents/terminals can
run `manage.py test` concurrently without colliding on CREATE DATABASE."""

from config.settings.dev import *  # noqa: F401,F403
from config.settings.dev import DATABASES

DATABASES["default"]["TEST"] = {"NAME": "test_districtr_b"}
