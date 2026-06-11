"""
Service-to-service calls from the Wagtail admin to the FastAPI backend.

The cms is the JWT issuer (authapi), so instead of a client-credentials flow
we mint short-lived RS256 access tokens in-process (authapi.tokens.
mint_service_token, shared with the issue_service_token management command)
and the backend verifies them against our JWKS endpoint with the usual
space-delimited `scope` claim.

GeoPackages are staged to the same bucket the backend reads from
(backend/app/core/config.py::get_s3_client) before the import is scheduled
via POST /api/admin/gerrydb/import.
"""

import boto3
import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from authapi import scopes as auth_scopes
from authapi.tokens import mint_service_token as _mint_service_token

GPKG_UPLOAD_PREFIX = "gerrydb-uploads"
OVERLAY_UPLOAD_PREFIX = "overlays"

REQUEST_TIMEOUT_SECONDS = 30


class BackendAPIError(Exception):
    """The FastAPI backend rejected (or failed) a service-to-service call."""


def mint_service_token(scopes: list[str], lifetime_minutes: int = 15) -> str:
    """Short-lived service token for backend calls (sub=service:cms-admin)."""
    return _mint_service_token("cms-admin", scopes, lifetime_minutes=lifetime_minutes)


def _post_backend(
    path: str,
    scopes: list[str],
    json: dict | None = None,
    ok_status: int = 200,
    *,
    what: str = "request",
) -> dict:
    """POST `path` to the backend with a fresh service token; return the body.

    Any status other than `ok_status` raises BackendAPIError as
    "Backend rejected the {what} (HTTP {status}): ...", surfacing the
    response's JSON `detail` when present (else the first 500 chars of text).
    """
    token = mint_service_token(scopes)
    response = requests.post(
        f"{settings.BACKEND_API_URL}{path}",
        json=json,
        headers={"Authorization": f"Bearer {token}"},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    if response.status_code != ok_status:
        try:
            body = response.json()
            detail = body.get("detail") if isinstance(body, dict) else None
        except ValueError:
            detail = None
        raise BackendAPIError(
            f"Backend rejected the {what} "
            f"(HTTP {response.status_code}): {detail or response.text[:500]}"
        )
    return response.json()


# Contract to mirror: backend/app/core/config.py::get_s3_client. Storage is
# AWS S3; keep the two clients in lockstep.
def get_s3_client():
    """boto3 S3 client, mirroring the backend's get_s3_client."""
    if not settings.AWS_ACCESS_KEY_ID or not settings.AWS_SECRET_ACCESS_KEY:
        raise ImproperlyConfigured(
            "AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY are not configured"
        )

    # AWS S3; AWS_S3_ENDPOINT overrides the host only for an S3-compatible
    # endpoint.
    kwargs = {}
    if settings.AWS_S3_ENDPOINT:
        kwargs["endpoint_url"] = settings.AWS_S3_ENDPOINT

    return boto3.client(
        service_name="s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        **kwargs,
    )


def _upload(file_obj, prefix: str, key: str) -> str:
    """Stream a file to the upload bucket under prefix/key; s3:// path back."""
    bucket = settings.GPKG_BUCKET
    if not bucket:
        raise ImproperlyConfigured(
            "No upload bucket configured (set R2_BUCKET_NAME or AWS_S3_BUCKET)"
        )
    full_key = f"{prefix}/{key}"
    get_s3_client().upload_fileobj(file_obj, bucket, full_key)
    return f"s3://{bucket}/{full_key}"


def upload_gpkg(file_obj, key: str) -> str:
    """Stream a GeoPackage to the bucket; returns the s3:// path."""
    return _upload(file_obj, GPKG_UPLOAD_PREFIX, key)


def upload_overlay(file_obj, key: str) -> str:
    """Stream an overlay file to the bucket; returns its public source URL.

    The URL stored on Overlay.source is built from OVERLAY_PUBLIC_URL_BASE
    (the CDN fronting the bucket) when configured; otherwise it falls back
    to the raw s3://bucket/key path.
    """
    s3_path = _upload(file_obj, OVERLAY_UPLOAD_PREFIX, key)
    if settings.OVERLAY_PUBLIC_URL_BASE:
        base = settings.OVERLAY_PUBLIC_URL_BASE.rstrip("/")
        return f"{base}/{OVERLAY_UPLOAD_PREFIX}/{key}"
    return s3_path


def schedule_import(
    gpkg_path: str,
    layer: str,
    table_name: str | None = None,
    rm: bool = False,
) -> dict:
    """POST /api/admin/gerrydb/import; returns the 202 response body."""
    return _post_backend(
        "/api/admin/gerrydb/import",
        [auth_scopes.CREATE_DISTRICTR_MAPS],
        json={"gpkg": gpkg_path, "layer": layer, "table_name": table_name, "rm": rm},
        ok_status=202,
        what="import",
    )


def schedule_compose(
    *,
    name: str,
    districtr_map_slug: str,
    parent_layer: str,
    child_layer: str | None,
    num_districts: int,
    tiles_s3_path: str | None,
    group_slug: str | None,
    map_type: str,
) -> dict:
    """POST /api/admin/districtr-map/compose; returns the 202 response body.

    The module is always composed hidden (visible=false): flip it on in the
    Districtr maps snippet once it has been checked. Non-202 responses carry
    a JSON `detail` (409 = slug already exists, 404 = unknown layer/group)
    which is surfaced verbatim.
    """
    return _post_backend(
        "/api/admin/districtr-map/compose",
        [auth_scopes.CREATE_DISTRICTR_MAPS],
        json={
            "name": name,
            "districtr_map_slug": districtr_map_slug,
            "parent_layer": parent_layer,
            "child_layer": child_layer,
            "num_districts": num_districts,
            "tiles_s3_path": tiles_s3_path,
            "group_slug": group_slug,
            "map_type": map_type,
            "visible": False,
        },
        ok_status=202,
        what="compose request",
    )


def regenerate_map_thumbnail(districtr_map_slug: str) -> dict:
    """POST /api/gerrydb/{slug}/thumbnail (scope create:content)."""
    return _post_backend(
        f"/api/gerrydb/{districtr_map_slug}/thumbnail",
        [auth_scopes.CREATE_CONTENT],
        what="thumbnail request",
    )


def regenerate_document_thumbnail(document_id: str) -> dict:
    """POST /api/document/{document_id}/thumbnail (scope create:content)."""
    return _post_backend(
        f"/api/document/{document_id}/thumbnail",
        [auth_scopes.CREATE_CONTENT],
        what="thumbnail request",
    )
