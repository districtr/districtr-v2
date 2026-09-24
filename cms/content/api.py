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
      "type": "portals" | "places" | "static"
    }

`body` is the StreamField API representation: block values are plain JSON
(struct -> dict with the exact camelCase keys from constants/cms.ts,
list -> plain list, rich_text -> HTML string).
"""

from django.conf import settings
from django.views.decorators.http import require_GET

from content.models import PlacePage, PreviewSnapshot, StaticPage, PortalPage
from core.api import _json, pagination

CONTENT_TYPE_PAGES = {
    "portals": PortalPage,
    # Old name, kept so a frontend deployed before this CMS release keeps
    # loading portal pages. Drop once both sides are on "portals".
    "tags": PortalPage,
    "places": PlacePage,
    "static": StaticPage,
}

DEFAULT_LANGUAGE = "en"

# Stable ordering for available_languages / list endpoints.
_LANGUAGE_ORDER = {
    code: i for i, (code, _name) in enumerate(settings.WAGTAIL_CONTENT_LANGUAGES)
}


def _language_sort_key(code):
    return (_LANGUAGE_ORDER.get(code, len(_LANGUAGE_ORDER)), code)


def _inject_portal_id(body_data, portal_slug):
    """A portal page's galleries list ITS portal's entries. The comment
    gallery always gets the portal id. A plan gallery marked thisPortal gets
    it as its filter. Injected when serving, never stored, so a slug rename
    can't leave a gallery on the old slug."""
    for block in body_data:
        value = block.get("value")
        if block.get("type") == "comment_gallery":
            value["portalId"] = portal_slug
        elif block.get("type") == "plan_gallery" and value.pop("thisPortal", False):
            value["tags"] = [portal_slug] if portal_slug else None
    return body_data


def _inject_form_config(body_data, portal_slug):
    """Attach the portal's FormConfig (which fields the form shows, camelCase
    per the constants/cms.ts contract) to every form block.

    ``portal_slug`` is the page's portal_id (the default-locale slug), so every
    locale serves the same form. Tolerates a missing
    mirror table the same way districtr_map_slug_choices does (test
    databases); a portal with no config serves ``fields: null`` and the
    frontend renders no form.
    """
    from django.db import DatabaseError, transaction

    from datastore.models import FormConfig, FormFieldCustom

    config, custom_fields = None, []
    try:
        with transaction.atomic():
            config = FormConfig.objects.filter(portal_id=portal_slug).first()
            if config is not None:
                custom_fields = [
                    {
                        "key": custom.key,
                        "label": custom.label,
                        "fieldType": custom.field_type,
                        "required": custom.required,
                    }
                    for custom in FormFieldCustom.objects.filter(
                        form_config_id=portal_slug
                    )
                ]
    except DatabaseError:
        pass
    for block in body_data:
        if block.get("type") == "form":
            block["value"].update(
                {
                    "portalId": portal_slug,
                    "collectionMode": config.collection_mode if config else None,
                    "fields": list(config.fields) if config else None,
                    "requiredFields": list(config.required_fields) if config else None,
                    "requireEmailConfirm": bool(config.require_email_confirm)
                    if config
                    else False,
                    "customFields": custom_fields if config else None,
                }
            )
        elif (
            block.get("type") == "map_create_buttons"
            and config is not None
            and config.collection_mode != "form"
        ):
            # Maps started from a portal page get a draft submission for the
            # portal (the auto-submit pathway). Manual-form portals collect
            # only through the form, so their map buttons stay plain.
            block["value"]["portalId"] = portal_slug
            block["value"]["collectionMode"] = config.collection_mode
    return body_data


def _serialize_page(page, content_type):
    body = page.body
    body_data = body.stream_block.get_api_representation(body)
    if CONTENT_TYPE_PAGES.get(content_type) is PortalPage:
        # Translations resolve to their default-locale portal, not their own
        # slug (PortalPage.portal_id).
        body_data = _inject_portal_id(body_data, page.portal_id)
        body_data = _inject_form_config(body_data, page.portal_id)
    content = {
        "title": page.title,
        "subtitle": page.subtitle,
        "slug": page.slug,
        "language": page.locale.language_code,
        "body": body_data,
        "updated_at": (page.last_published_at and page.last_published_at.isoformat()),
    }
    if CONTENT_TYPE_PAGES.get(content_type) is PortalPage:
        content["districtr_map_slug"] = page.districtr_map_slug or None
    elif content_type == "places":
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
        live_pages.values_list("locale__language_code", flat=True).distinct(),
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
def content_preview(request, token):
    """GET /api/content/preview/<token>

    Draft snapshot minted by the editor's Preview button
    (ContentPageBase.serve_preview). Token-gated: the unguessable uuid with a
    short TTL is the whole authorization, so no auth header is required."""
    snapshot = PreviewSnapshot.fresh().filter(token=token).first()
    if snapshot is None:
        return _json({"detail": "Preview expired or not found"}, status=404)
    return _json(snapshot.data)


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
        offset, limit = pagination(request)
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
        if CONTENT_TYPE_PAGES.get(content_type) is PortalPage:
            item["districtr_map_slug"] = page.districtr_map_slug or None
        elif content_type == "places":
            item["districtr_map_slugs"] = page.districtr_map_slugs or None
        results.append(item)
    return _json(results)
