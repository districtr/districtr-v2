from django.conf import settings
from django.http import JsonResponse

from authapi.jwks import all_jwks
from authapi.serializers import mint_extract_token
from core.menu import in_groups

EXTRACT_GROUPS = ("data_user", "admin")


def extract_page_url():
    """The app's data-extract page (menu item + dashboard card link here)."""
    return f"{settings.FRONTEND_URL.rstrip('/')}/extract"


def jwks(request):
    """Public JWKS endpoint the FastAPI backend points PyJWKClient at."""
    response = JsonResponse({"keys": all_jwks()})
    # Allow cross-origin fetches and let verifiers cache briefly; PyJWKClient
    # caches client-side as well.
    response["Access-Control-Allow-Origin"] = "*"
    response["Cache-Control"] = "public, max-age=300"
    return response


def extract_token(request):
    """Data-extract token for the signed-in admin user, for the app's /extract page.

    The app fetches this cross-origin with credentials. The CMS and app are
    same-site (cms.districtr.org / districtr.org; localhost ports locally), so
    the Lax session cookie is sent, and CORS only lets FRONTEND_URL read the
    response. A plain GET needs no preflight.
    """
    user = request.user
    if not user.is_authenticated:
        response = JsonResponse({"detail": "Sign in to the CMS"}, status=401)
    elif not in_groups(user, EXTRACT_GROUPS):
        response = JsonResponse({"detail": "Needs the data_user role"}, status=403)
    else:
        response = JsonResponse({"token": mint_extract_token(user)})
    response["Access-Control-Allow-Origin"] = settings.FRONTEND_URL.rstrip("/")
    response["Access-Control-Allow-Credentials"] = "true"
    response["Cache-Control"] = "no-store"
    return response
