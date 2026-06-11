"""
Public read-only API for curated plan galleries.

Same conventions as content/api.py: plain Django views, live (published)
objects only, `Access-Control-Allow-Origin: *`.

    GET /api/galleries/<slug>
        {"title", "slug", "section", "description" (HTML),
         "entries": [{"document_public_id", "caption"}, ...]}
        - 404 when no live gallery has the slug (drafts are invisible);
        - group_only galleries require a valid Districtr Bearer token
          (403 otherwise); public ones are anonymous.

    GET /api/galleries/?section=public_gallery
        Live PUBLIC galleries only: [{"slug", "title", "section",
        "entry_count"}, ...]. group_only galleries never appear here.

Auth simplification: a group_only gallery accepts ANY valid token issued by
this service (signature/audience/issuer/expiry verified with our own
verifying key via the same SimpleJWT token class the issuer uses — see
authapi.tokens.KidAccessToken). The token's roles/groups are NOT matched
against gallery.map_group yet; that hook exists on the model for when
per-group scoping is needed.
"""

from django.db.models import Count
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from rest_framework_simplejwt.exceptions import TokenError
from wagtail.rich_text import expand_db_html

from authapi.tokens import KidAccessToken
from galleries.models import Gallery, GallerySection, GalleryVisibility


def _cors(response):
    # Public content: same posture as content/api.py.
    response["Access-Control-Allow-Origin"] = "*"
    return response


def _json(payload, status=200):
    return _cors(JsonResponse(payload, status=status, safe=False))


def _has_valid_token(request) -> bool:
    """True when the request bears a valid Districtr-issued access token.

    KidAccessToken decodes with our own SIMPLE_JWT verifying key and enforces
    signature, expiry, audience and issuer — the same checks the FastAPI
    backend applies (authapi/tests.py::fastapi_style_verify).
    """
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        return False
    try:
        KidAccessToken(authorization.removeprefix("Bearer ").strip())
    except TokenError:
        return False
    return True


@require_GET
def gallery_detail(request, slug):
    """GET /api/galleries/<slug>"""
    gallery = Gallery.objects.filter(live=True, slug=slug).first()
    if gallery is None:
        return _json({"detail": f"Gallery '{slug}' not found"}, status=404)

    if gallery.visibility == GalleryVisibility.GROUP_ONLY and not _has_valid_token(
        request
    ):
        return _json({"detail": "A valid bearer token is required"}, status=403)

    return _json(
        {
            "title": gallery.title,
            "slug": gallery.slug,
            "section": gallery.section,
            "description": expand_db_html(gallery.description),
            "entries": [
                {
                    "document_public_id": entry.document_public_id,
                    "caption": entry.caption,
                }
                # Orderable: entries come back in their curated sort_order.
                for entry in gallery.entries.all()
            ],
        }
    )


@require_GET
def gallery_list(request):
    """GET /api/galleries/?section=public_gallery"""
    queryset = Gallery.objects.filter(
        live=True, visibility=GalleryVisibility.PUBLIC
    ).annotate(entry_count=Count("entries"))

    section = request.GET.get("section")
    if section:
        if section not in GallerySection.values:
            return _json({"detail": f"Unknown section '{section}'"}, status=400)
        queryset = queryset.filter(section=section)

    return _json(
        [
            {
                "slug": gallery.slug,
                "title": gallery.title,
                "section": gallery.section,
                "entry_count": gallery.entry_count,
            }
            for gallery in queryset.order_by("slug")
        ]
    )
