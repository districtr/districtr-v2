from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from wagtail import urls as wagtail_urls
from wagtail.admin import urls as wagtailadmin_urls
from wagtail.documents import urls as wagtaildocs_urls

from authapi.views import (
    DistrictrTokenObtainPairView,
    DistrictrTokenRefreshView,
    jwks,
)
from core.views import health

urlpatterns = [
    path("health", health),
    path(".well-known/jwks.json", jwks),
    path("api/token/", DistrictrTokenObtainPairView.as_view(), name="token_obtain"),
    path(
        "api/token/refresh/",
        DistrictrTokenRefreshView.as_view(),
        name="token_refresh",
    ),
    # Public content compat API (replaces the legacy FastAPI /api/cms/content).
    path("api/content/", include("content.urls")),
    # Public curated plan galleries (new capability — no legacy equivalent).
    path("api/galleries/", include("galleries.urls")),
    path("django-admin/", admin.site.urls),
    path("admin/", include(wagtailadmin_urls)),
    path("documents/", include(wagtaildocs_urls)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

urlpatterns += [
    # Wagtail page serving — keep last (catch-all).
    path("", include(wagtail_urls)),
]
