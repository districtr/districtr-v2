"""
Public read-only compat API replicating the legacy FastAPI endpoints
(backend/app/cms/main.py: get_cms_content / list_cms_content).

Semantics preserved:
- serves LIVE (published) pages only;
- if the requested language has no live page, falls back to English;
- 404 when the slug has no live page in any language.

Response shape (consumed by app/src/app/utils/api/cms.ts successors):

    {
      "content": {
        "title": ..., "subtitle": ..., "slug": ..., "language": ...,
        "districtr_map_slug" | "districtr_map_slugs": ...,
        "body": [{"type": ..., "value": ..., "id": ...}, ...],
        "updated_at": ...
      },
      "available_languages": ["en", ...],
      "type": "tags" | "places"
    }

`body` is the StreamField API representation: block values are plain JSON
(struct -> dict with the exact camelCase keys from constants/cms.ts,
list -> plain list, rich_text -> HTML string).
"""

from django.conf import settings
from django.views.decorators.http import require_GET

from content.models import PlacePage, TagPage
from core.api import _json

CONTENT_TYPE_PAGES = {
    "tags": TagPage,
    "places": PlacePage,
}

DEFAULT_LANGUAGE = "en"
MAX_PAGE_SIZE = 100

# Stable ordering for available_languages / list endpoints.
_LANGUAGE_ORDER = {
    code: i for i, (code, _name) in enumerate(settings.WAGTAIL_CONTENT_LANGUAGES)
}


def _language_sort_key(code):
    return (_LANGUAGE_ORDER.get(code, len(_LANGUAGE_ORDER)), code)


def _serialize_page(page, content_type):
    body = page.body
    content = {
        "title": page.title,
        "subtitle": page.subtitle,
        "slug": page.slug,
        "language": page.locale.language_code,
        "body": body.stream_block.get_api_representation(body),
        "updated_at": (page.last_published_at and page.last_published_at.isoformat()),
    }
    if content_type == "tags":
        content["districtr_map_slug"] = page.districtr_map_slug or None
    else:
        content["districtr_map_slugs"] = page.districtr_map_slugs or None
    return content


@require_GET
def content_detail(request, content_type, slug):
    """GET /api/content/<type>/slug/<slug>?language=xx"""
    model = CONTENT_TYPE_PAGES.get(content_type)
    if model is None:
        return _json({"detail": f"Unknown content type '{content_type}'"}, status=404)

    language = request.GET.get("language") or DEFAULT_LANGUAGE
    # Compute the available-language set from a lightweight values_list (no
    # body columns), then fetch only the single chosen page in full — rather
    # than loading every language's StreamField body just to pick one.
    live_pages = model.objects.live().filter(slug=slug)
    available_languages = sorted(
        live_pages.values_list("locale__language_code", flat=True),
        key=_language_sort_key,
    )

    preferred = language if language in available_languages else DEFAULT_LANGUAGE
    page = (
        live_pages.filter(locale__language_code=preferred)
        .select_related("locale")
        .first()
        if preferred in available_languages
        else None
    )
    if page is None:
        return _json(
            {
                "detail": (
                    f"Content with slug '{slug}' and language "
                    f"'{language}' not found"
                )
            },
            status=404,
        )

    return _json(
        {
            "content": _serialize_page(page, content_type),
            "available_languages": available_languages,
            "type": content_type,
        }
    )


@require_GET
def content_list(request, content_type):
    """GET /api/content/<type>/list?language=xx&offset=n&limit=n

    Without a ``language`` param the list spans ALL languages — a slug whose
    only live page is non-English must not vanish from the listing. Passing
    ``language=xx`` filters to exactly that language (no English fallback).
    """
    model = CONTENT_TYPE_PAGES.get(content_type)
    if model is None:
        return _json({"detail": f"Unknown content type '{content_type}'"}, status=404)

    try:
        offset = max(int(request.GET.get("offset", 0)), 0)
        limit = min(int(request.GET.get("limit", MAX_PAGE_SIZE)), MAX_PAGE_SIZE)
    except ValueError:
        return _json({"detail": "offset and limit must be integers"}, status=400)

    # The list only emits slug/title/language/map-slug fields; defer the heavy
    # StreamField body so we don't pull up to MAX_PAGE_SIZE full bodies.
    queryset = model.objects.live().select_related("locale").defer("body")
    language = request.GET.get("language")
    if language:
        queryset = queryset.filter(locale__language_code=language)

    queryset = queryset.order_by("slug", "locale__language_code")
    results = []
    for page in queryset[offset : offset + limit]:
        item = {
            "slug": page.slug,
            "title": page.title,
            "language": page.locale.language_code,
        }
        # Map associations, used e.g. by the homepage PlaceMap to count
        # modules per place without fetching each page.
        if content_type == "tags":
            item["districtr_map_slug"] = page.districtr_map_slug or None
        else:
            item["districtr_map_slugs"] = page.districtr_map_slugs or None
        results.append(item)
    return _json(results)
