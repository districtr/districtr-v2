from .base import *  # noqa: F403

DEBUG = True

SECRET_KEY = os.environ.get(  # noqa: F405
    "DJANGO_SECRET_KEY", "django-insecure-dev-only-key"
)

ALLOWED_HOSTS = ["*"]

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Manifest static storage requires collectstatic; use plain storage in dev.
STORAGES["staticfiles"] = {  # noqa: F405
    "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
}
