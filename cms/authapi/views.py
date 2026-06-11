from django.http import JsonResponse
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from authapi.jwks import all_jwks
from authapi.serializers import (
    DistrictrTokenObtainPairSerializer,
    DistrictrTokenRefreshSerializer,
)


def jwks(request):
    """Public JWKS endpoint the FastAPI backend points PyJWKClient at."""
    response = JsonResponse({"keys": all_jwks()})
    # Allow cross-origin fetches and let verifiers cache briefly; PyJWKClient
    # caches client-side as well.
    response["Access-Control-Allow-Origin"] = "*"
    response["Cache-Control"] = "public, max-age=300"
    return response


class LoginRateThrottle(AnonRateThrottle):
    scope = "login"


class DistrictrTokenObtainPairView(TokenObtainPairView):
    serializer_class = DistrictrTokenObtainPairSerializer
    throttle_classes = [LoginRateThrottle]


class DistrictrTokenRefreshView(TokenRefreshView):
    serializer_class = DistrictrTokenRefreshSerializer
