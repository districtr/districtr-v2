from .base import *  # noqa: F403

DEBUG = False

# Fly terminates TLS at the edge and forwards X-Forwarded-Proto.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

CSRF_TRUSTED_ORIGINS = [
    o
    for o in os.environ.get("DJANGO_CSRF_TRUSTED_ORIGINS", "").split(",")
    if o  # noqa: F405
]

# Media on S3 / Cloudflare R2. Mirrors backend/app/core/config.py
# get_s3_client(): when ACCOUNT_ID is set, storage is Cloudflare R2; otherwise
# plain AWS S3 (optionally with a custom AWS_S3_ENDPOINT).
_account_id = os.environ.get("ACCOUNT_ID")  # noqa: F405
_bucket = os.environ.get("R2_BUCKET_NAME") or os.environ.get("AWS_S3_BUCKET")  # noqa: F405
if _bucket:
    STORAGES["default"] = {  # noqa: F405
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": _bucket,
            "location": "cms-media",
            "endpoint_url": (
                f"https://{_account_id}.r2.cloudflarestorage.com"
                if _account_id
                else os.environ.get("AWS_S3_ENDPOINT") or None  # noqa: F405
            ),
            "custom_domain": os.environ.get("CDN_DOMAIN") or None,  # noqa: F405
            "file_overwrite": False,
            "default_acl": None,
        },
    }

# Transactional email via Resend
EMAIL_BACKEND = "anymail.backends.resend.EmailBackend"
ANYMAIL = {
    "RESEND_API_KEY": os.environ.get("RESEND_API_KEY", ""),  # noqa: F405
}
