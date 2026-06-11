"""
Shared helpers for the public read-only JSON APIs (content/api.py and
galleries/api.py): permissive CORS + JsonResponse, matching the posture of
the legacy FastAPI CORS middleware.
"""

from django.http import JsonResponse

__all__ = ["_cors", "_json"]


def _cors(response):
    # Public content: same posture as the legacy FastAPI CORS middleware.
    response["Access-Control-Allow-Origin"] = "*"
    return response


def _json(payload, status=200):
    return _cors(JsonResponse(payload, status=status, safe=False))
