from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView
from wagtail import urls as wagtail_urls
from wagtail.admin import urls as wagtailadmin_urls
from wagtail.documents import urls as wagtaildocs_urls

from authapi.views import jwks

urlpatterns = [
    # The CMS domain has no public site of its own (the Next.js app renders
    # content) — send visitors to the admin.
    path("", RedirectView.as_view(url="/admin/")),
    path(".well-known/jwks.json", jwks),
    # Public content compat API (replaces the legacy FastAPI /api/cms/content).
    path("api/content/", include("content.urls")),
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
