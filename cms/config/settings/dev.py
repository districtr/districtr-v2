import os

from .base import *  # noqa: F403

DEBUG = True

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "django-insecure-dev-only-key")

ALLOWED_HOSTS = ["*"]

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Manifest static storage requires collectstatic; use plain storage in dev.
STORAGES["staticfiles"] = {  # noqa: F405
    "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
}

# Dev convenience: generate an ephemeral JWT keypair when none is configured
# (tokens won't survive a restart — fine for local work; run
# `manage.py generate_jwt_keys` and set JWT_SIGNING_KEY/JWT_VERIFYING_KEY in
# cms/.env.docker for stable local keys).
if not SIMPLE_JWT["SIGNING_KEY"]:  # noqa: F405
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    _dev_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    SIMPLE_JWT["SIGNING_KEY"] = _dev_key.private_bytes(  # noqa: F405
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("ascii")
    SIMPLE_JWT["VERIFYING_KEY"] = (  # noqa: F405
        _dev_key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode("ascii")
    )
