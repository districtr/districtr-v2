from django.http import JsonResponse

from authapi.jwks import all_jwks


def jwks(request):
    """Public JWKS endpoint the FastAPI backend points PyJWKClient at."""
    response = JsonResponse({"keys": all_jwks()})
    # Allow cross-origin fetches and let verifiers cache briefly; PyJWKClient
    # caches client-side as well.
    response["Access-Control-Allow-Origin"] = "*"
    response["Cache-Control"] = "public, max-age=300"
    return response
