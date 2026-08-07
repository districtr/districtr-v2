"""
Shared helpers for the public read-only JSON APIs (content/api.py and
galleries/api.py): permissive CORS + JsonResponse, matching the posture of
the legacy FastAPI CORS middleware, plus clamped pagination parsing.
"""

from django.http import JsonResponse

__all__ = ["_cors", "_json", "pagination", "MAX_PAGE_SIZE"]

MAX_PAGE_SIZE = 100


def pagination(request, max_page_size=MAX_PAGE_SIZE):
    """Non-negative, clamped ``(offset, limit)`` from the querystring.
    Raises ValueError on non-integer input — callers respond 400."""
    offset = max(int(request.GET.get("offset", 0)), 0)
    limit = min(max(int(request.GET.get("limit", max_page_size)), 0), max_page_size)
    return offset, limit


def _cors(response):
    # Public content: same posture as the legacy FastAPI CORS middleware.
    response["Access-Control-Allow-Origin"] = "*"
    return response


def _json(payload, status=200):
    return _cors(JsonResponse(payload, status=status, safe=False))
