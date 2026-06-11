"""
Base settings for the Districtr CMS (Wagtail).

This service shares the Postgres database with the FastAPI backend. All
Django/Wagtail-owned tables live in the dedicated `admin` schema (created by
`manage.py bootstrap_schema`); the FastAPI/Alembic-owned tables in `public`
are reached through the search_path and are only ever mapped with
managed=False models. The Alembic include_object guard in
backend/app/alembic/env.py is the other half of this contract.
"""

import os
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")

DEBUG = False

ALLOWED_HOSTS = [h for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "").split(",") if h]

INSTALLED_APPS = [
    "core",
    "authapi",
    "datastore",
    "content",
    "galleries",
    "wagtail_localize",
    "wagtail_localize.locales",
    "wagtail.contrib.forms",
    "wagtail.contrib.redirects",
    "wagtail.embeds",
    "wagtail.sites",
    "wagtail.users",
    "wagtail.snippets",
    "wagtail.documents",
    "wagtail.images",
    "wagtail.search",
    "wagtail.admin",
    "wagtail",
    "modelcluster",
    "taggit",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "wagtail.contrib.redirects.middleware.RedirectMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# Database: same env contract as the FastAPI backend (POSTGRES_* vars; see
# backend/app/alembic/env.py::get_url). All Django-owned tables go to the
# `admin` schema via search_path; `public` tables are reachable for
# managed=False mirrors.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "districtr"),
        "USER": os.environ.get("POSTGRES_USER", "postgres"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", ""),
        "HOST": os.environ.get("POSTGRES_SERVER", "db"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
        "OPTIONS": {"options": "-c search_path=admin,public"},
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# Internationalization. WAGTAIL_CONTENT_LANGUAGES mirrors the LanguageEnum the
# legacy FastAPI cms module supported (backend/app/cms/models.py).
LANGUAGE_CODE = "en"

LANGUAGES = WAGTAIL_CONTENT_LANGUAGES = [
    ("en", "English"),
    ("es", "Spanish"),
    ("zh", "Chinese"),
    ("vi", "Vietnamese"),
    ("ht", "Haitian Creole"),
    ("pt", "Portuguese"),
]

WAGTAIL_I18N_ENABLED = True

TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True


# Static files (served by whitenoise)
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# Wagtail
WAGTAIL_SITE_NAME = "Districtr CMS"
WAGTAILADMIN_BASE_URL = os.environ.get("WAGTAILADMIN_BASE_URL", "http://localhost:8001")
WAGTAILSEARCH_BACKENDS = {
    "default": {
        "BACKEND": "wagtail.search.backends.database",
    }
}

DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "noreply@districtr.org")


# FastAPI backend (service-to-service calls: GeoPackage imports, thumbnail
# regeneration). The cms signs short-lived RS256 service tokens the backend
# verifies against our JWKS.
BACKEND_API_URL = os.environ.get("BACKEND_API_URL", "http://localhost:8000")

# Object storage for GeoPackage uploads. Mirrors the backend's env contract
# (backend/app/core/config.py): ACCOUNT_ID selects Cloudflare R2, otherwise
# AWS_S3_ENDPOINT (if set) or plain AWS S3.
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
GPKG_BUCKET = os.environ.get("R2_BUCKET_NAME") or os.environ.get("AWS_S3_BUCKET", "")
R2_ACCOUNT_ID = os.environ.get("ACCOUNT_ID", "")
AWS_S3_ENDPOINT = os.environ.get("AWS_S3_ENDPOINT", "")

# Public base URL for uploaded overlay sources (Overlay.source). When the
# bucket is fronted by a CDN (e.g. https://tilesets1.cdn.districtr.org in
# prod), set this so the stored source is a browser-loadable URL; when unset,
# the raw s3://bucket/key path is stored instead.
OVERLAY_PUBLIC_URL_BASE = os.environ.get("OVERLAY_PUBLIC_URL_BASE", "")

# Next.js frontend — used for admin-menu cross-links to the legacy review
# pages (/admin/review, /admin/review/district-comments, /admin/thumbnails).
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")


# JWT issuance. This service replaces Auth0 as the token issuer for both the
# Next.js frontend (login/refresh) and the FastAPI backend (verification via
# the /.well-known/jwks.json endpoint + the space-delimited `scope` claim).
def _pem_from_env(name: str) -> str:
    """PEMs arrive via env/secrets; tolerate literal \\n escapes."""
    value = os.environ.get(name, "")
    return value.replace("\\n", "\n")


JWT_SIGNING_KEY = _pem_from_env("JWT_SIGNING_KEY")
JWT_VERIFYING_KEY = _pem_from_env("JWT_VERIFYING_KEY")
# During key rotation: serve the incoming public key alongside the active one.
JWT_NEXT_VERIFYING_KEY = _pem_from_env("JWT_NEXT_VERIFYING_KEY")

JWT_ISSUER = os.environ.get("JWT_ISSUER", WAGTAILADMIN_BASE_URL)
JWT_AUDIENCE = os.environ.get("JWT_AUDIENCE", "http://localhost:8000/")

SIMPLE_JWT = {
    "ALGORITHM": "RS256",
    "SIGNING_KEY": JWT_SIGNING_KEY,
    "VERIFYING_KEY": JWT_VERIFYING_KEY,
    "ISSUER": JWT_ISSUER,
    "AUDIENCE": JWT_AUDIENCE,
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=10),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=14),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_TOKEN_CLASSES": ("authapi.tokens.KidAccessToken",),
    "UPDATE_LAST_LOGIN": True,
}

REST_FRAMEWORK = {
    "DEFAULT_THROTTLE_RATES": {
        # Brute-force guard on /api/token/
        "login": "10/min",
    },
}
