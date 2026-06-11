"""
Service-to-service calls from the Wagtail admin to the FastAPI backend.

The cms is the JWT issuer (authapi), so instead of a client-credentials flow
we mint short-lived RS256 access tokens in-process (mirroring
authapi/management/commands/issue_service_token.py) and the backend verifies
them against our JWKS endpoint with the usual space-delimited `scope` claim.

GeoPackages are staged to the same bucket the backend reads from
(backend/app/core/config.py::get_s3_client) before the import is scheduled
via POST /api/admin/gerrydb/import.
"""

from datetime import timedelta

import boto3
import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from authapi import scopes as auth_scopes
from authapi.tokens import KidAccessToken

GPKG_UPLOAD_PREFIX = "gerrydb-uploads"
OVERLAY_UPLOAD_PREFIX = "overlays"

REQUEST_TIMEOUT_SECONDS = 30


class BackendAPIError(Exception):
    """The FastAPI backend rejected (or failed) a service-to-service call."""


def mint_service_token(scopes: list[str], lifetime_minutes: int = 15) -> str:
    """Short-lived service token for backend calls (sub=service:cms-admin)."""
    token = KidAccessToken()
    token.set_exp(lifetime=timedelta(minutes=lifetime_minutes))
    token["sub"] = "service:cms-admin"
    token["scope"] = " ".join(scopes)
    return str(token)


def get_s3_client():
    """boto3 client mirroring the backend's R2-vs-S3 conditional."""
    if not settings.AWS_ACCESS_KEY_ID or not settings.AWS_SECRET_ACCESS_KEY:
        raise ImproperlyConfigured(
            "AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY are not configured"
        )

    kwargs = {}
    if settings.R2_ACCOUNT_ID:
        kwargs["endpoint_url"] = (
            f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
        )
        kwargs["region_name"] = "auto"
    elif settings.AWS_S3_ENDPOINT:
        kwargs["endpoint_url"] = settings.AWS_S3_ENDPOINT

    return boto3.client(
        service_name="s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        **kwargs,
    )


def upload_gpkg(file_obj, key: str) -> str:
    """Stream a GeoPackage to the bucket; returns the s3:// path."""
    bucket = settings.GPKG_BUCKET
    if not bucket:
        raise ImproperlyConfigured(
            "No upload bucket configured (set R2_BUCKET_NAME or AWS_S3_BUCKET)"
        )
    full_key = f"{GPKG_UPLOAD_PREFIX}/{key}"
    get_s3_client().upload_fileobj(file_obj, bucket, full_key)
    return f"s3://{bucket}/{full_key}"


def upload_overlay(file_obj, key: str) -> str:
    """Stream an overlay file to the bucket; returns its public source URL.

    The URL stored on Overlay.source is built from OVERLAY_PUBLIC_URL_BASE
    (the CDN fronting the bucket) when configured; otherwise it falls back
    to the raw s3://bucket/key path.
    """
    bucket = settings.GPKG_BUCKET
    if not bucket:
        raise ImproperlyConfigured(
            "No upload bucket configured (set R2_BUCKET_NAME or AWS_S3_BUCKET)"
        )
    full_key = f"{OVERLAY_UPLOAD_PREFIX}/{key}"
    get_s3_client().upload_fileobj(file_obj, bucket, full_key)
    if settings.OVERLAY_PUBLIC_URL_BASE:
        return f"{settings.OVERLAY_PUBLIC_URL_BASE.rstrip('/')}/{full_key}"
    return f"s3://{bucket}/{full_key}"


def schedule_import(
    gpkg_path: str,
    layer: str,
    table_name: str | None = None,
    rm: bool = False,
) -> dict:
    """POST /api/admin/gerrydb/import; returns the 202 response body."""
    token = mint_service_token([auth_scopes.CREATE_DISTRICTR_MAPS])
    response = requests.post(
        f"{settings.BACKEND_API_URL}/api/admin/gerrydb/import",
        json={"gpkg": gpkg_path, "layer": layer, "table_name": table_name, "rm": rm},
        headers={"Authorization": f"Bearer {token}"},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    if response.status_code != 202:
        raise BackendAPIError(
            f"Backend rejected the import (HTTP {response.status_code}): "
            f"{response.text[:500]}"
        )
    return response.json()


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
    token = mint_service_token([auth_scopes.CREATE_DISTRICTR_MAPS])
    response = requests.post(
        f"{settings.BACKEND_API_URL}/api/admin/districtr-map/compose",
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
        headers={"Authorization": f"Bearer {token}"},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    if response.status_code != 202:
        try:
            body = response.json()
            detail = body.get("detail") if isinstance(body, dict) else None
        except ValueError:
            detail = None
        raise BackendAPIError(
            f"Backend rejected the compose request "
            f"(HTTP {response.status_code}): {detail or response.text[:500]}"
        )
    return response.json()


def regenerate_map_thumbnail(districtr_map_slug: str) -> dict:
    """POST /api/gerrydb/{slug}/thumbnail (scope create:content)."""
    token = mint_service_token([auth_scopes.CREATE_CONTENT])
    response = requests.post(
        f"{settings.BACKEND_API_URL}/api/gerrydb/{districtr_map_slug}/thumbnail",
        headers={"Authorization": f"Bearer {token}"},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    if response.status_code != 200:
        raise BackendAPIError(
            f"Backend rejected the thumbnail request "
            f"(HTTP {response.status_code}): {response.text[:500]}"
        )
    return response.json()


def regenerate_document_thumbnail(document_id: str) -> dict:
    """POST /api/document/{document_id}/thumbnail (scope create:content)."""
    token = mint_service_token([auth_scopes.CREATE_CONTENT])
    response = requests.post(
        f"{settings.BACKEND_API_URL}/api/document/{document_id}/thumbnail",
        headers={"Authorization": f"Bearer {token}"},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    if response.status_code != 200:
        raise BackendAPIError(
            f"Backend rejected the thumbnail request "
            f"(HTTP {response.status_code}): {response.text[:500]}"
        )
    return response.json()
