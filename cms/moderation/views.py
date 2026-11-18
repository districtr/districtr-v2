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
# Matches the backend's BANNER_MESSAGE_MAX_LENGTH (backend/app/cms/models.py).
BANNER_MESSAGE_MAX_LENGTH = 500


def _normalized(message: str) -> str:
    # The textarea and the hidden original both submit CRLF line breaks.
    return message.replace("\r\n", "\n").strip()


def _changes(post) -> dict:
    """Only the fields the admin changed from what the form loaded, so two
    admins saving at once don't overwrite each other's other field."""
    changes = {}
    under_construction = "under_construction" in post
    if under_construction != (post.get("original_under_construction") == "on"):
        changes["under_construction"] = under_construction
    banner = _normalized(post.get("banner_message", ""))
    if banner != _normalized(post.get("original_banner_message", "")):
        changes["banner_message"] = banner
    return changes


@group_required(SITE_SETTINGS_GROUPS)
def site_settings(request):
    if request.method == "POST":
        changes = _changes(request.POST)
        if not changes:
            messages.info(request, "Nothing changed.")
            return redirect("moderation_site_settings")
        try:
            services.update_site_settings(request.user, changes)
        except (BackendAPIError, RequestException) as exc:
            logger.exception("Site settings update failed")
            messages.error(request, f"Saving failed: {exc}")
        else:
            messages.success(
                request,
                "Site settings saved. The API picks the change up within 15 "
                "seconds, the public site within a minute, and open tabs "
                "within about five minutes.",
            )
        return redirect("moderation_site_settings")

    current, error = {}, None
    try:
        current = services.get_site_settings()
    except (BackendAPIError, RequestException) as exc:
        logger.exception("Site settings fetch failed")
        error = str(exc)
    return render(
        request,
        "moderation/site_settings.html",
        {
            "under_construction": current.get("under_construction"),
            "banner_message": current.get("banner_message") or "",
            "banner_max_length": BANNER_MESSAGE_MAX_LENGTH,
            # Without the current values, saving would overwrite them blind.
            "error": error,
        },
    )
