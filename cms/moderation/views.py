"""
Site-settings view — all that remains of the moderation app's views.

The review queues were retired: submissions are public on arrival and the
takedown surface (hide/blur + visitor reports) lives on the Portals hub
(portals/views.py). The HTTP bridge to the backend stays here in services.py.
"""

import logging

from django.shortcuts import redirect, render
from requests import RequestException
from wagtail.admin import messages

from core.menu import group_required
from moderation import services
from moderation.services import BackendAPIError

logger = logging.getLogger(__name__)

SITE_SETTINGS_GROUPS = frozenset({"admin"})


@group_required(SITE_SETTINGS_GROUPS)
def site_settings(request):
    if request.method == "POST":
        try:
            services.update_site_settings(
                request.user, "under_construction" in request.POST
            )
        except (BackendAPIError, RequestException) as exc:
            logger.exception("Site settings update failed")
            messages.error(request, f"Saving failed: {exc}")
        else:
            messages.success(
                request,
                "Site settings saved. The frontend picks the change up "
                "within about a minute.",
            )
        return redirect("moderation_site_settings")

    under_construction, error = False, None
    try:
        under_construction = services.get_site_settings().get("under_construction")
    except (BackendAPIError, RequestException) as exc:
        logger.exception("Site settings fetch failed")
        error = str(exc)
    return render(
        request,
        "moderation/site_settings.html",
        {"under_construction": under_construction, "error": error},
    )
