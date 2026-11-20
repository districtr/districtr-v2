"""
Site-settings view — all that remains of the moderation app's views.

The review queues were retired: submissions are public on arrival and the
takedown surface (hide/blur + visitor reports) lives on the Portals hub
(portals/views.py). The HTTP bridge to the backend stays here in services.py.
"""

import json
import logging
from datetime import timedelta

from django.shortcuts import redirect, render
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from requests import RequestException
from wagtail.admin import messages

from core.menu import group_required
from moderation import services
from moderation.services import BackendAPIError

logger = logging.getLogger(__name__)

SITE_SETTINGS_GROUPS = frozenset({"admin"})
# Matches the backend's BANNER_MESSAGE_MAX_LENGTH (backend/app/cms/models.py).
BANNER_MESSAGE_MAX_LENGTH = 500
# A day: anything longer is an announcement for the banner text, not a countdown.
MAX_COUNTDOWN_MINUTES = 24 * 60


def _normalized(message: str) -> str:
    # The textarea and the hidden original both submit CRLF line breaks.
    return message.replace("\r\n", "\n").strip()


def _flags(text: str) -> dict:
    # Blank means no flags, i.e. every feature at its frontend default. The
    # backend checks the shape (an object of true/false).
    try:
        flags = json.loads(text) if text.strip() else {}
    except json.JSONDecodeError as exc:
        raise ValueError(f"Feature flags aren't valid JSON: {exc}") from exc
    # `null` would read as "leave as is" to the backend, yet report saved.
    if not isinstance(flags, dict):
        raise ValueError(
            'Feature flags must be a JSON object, e.g. {"tuningView": false}.'
        )
    return flags


def _changes(post) -> dict:
    """Only the fields the admin changed from what the form loaded, so two
    admins saving at once don't overwrite each other's other field. Raises
    ValueError on input to refuse, with a message for the admin."""
    changes = {}
    under_construction = "under_construction" in post
    if under_construction != (post.get("original_under_construction") == "on"):
        changes["under_construction"] = under_construction
    banner = _normalized(post.get("banner_message", ""))
    if banner != _normalized(post.get("original_banner_message", "")):
        changes["banner_message"] = banner
    # Relative, not a clock time: no timezone for the admin to get wrong.
    minutes = post.get("downtime_minutes", "").strip()
    if minutes:
        if not minutes.isdigit() or not 0 < int(minutes) <= MAX_COUNTDOWN_MINUTES:
            raise ValueError(
                f"Downtime must be 1 to {MAX_COUNTDOWN_MINUTES} minutes away."
            )
        if under_construction:
            # The API clears a countdown while maintenance is on.
            raise ValueError(
                "A countdown warns before maintenance. Untick Maintenance "
                "mode to start one."
            )
        at = timezone.now() + timedelta(minutes=int(minutes))
        changes["downtime_at"] = at.isoformat()
    elif "cancel_countdown" in post:
        changes["downtime_at"] = None
    flags = _flags(post.get("feature_flags", ""))
    if flags != _flags(post.get("original_feature_flags", "")):
        changes["feature_flags"] = flags
    return changes


@group_required(SITE_SETTINGS_GROUPS)
def site_settings(request):
    if request.method == "POST":
        try:
            changes = _changes(request.POST)
        except ValueError as exc:
            messages.error(request, str(exc))
            return redirect("moderation_site_settings")
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
                "seconds, the public site and open tabs within about a minute.",
            )
        return redirect("moderation_site_settings")

    current, error = {}, None
    try:
        current = services.get_site_settings()
    except (BackendAPIError, RequestException) as exc:
        logger.exception("Site settings fetch failed")
        error = str(exc)
    downtime_at = parse_datetime(current.get("downtime_at") or "")
    return render(
        request,
        "moderation/site_settings.html",
        {
            "under_construction": current.get("under_construction"),
            "banner_message": current.get("banner_message") or "",
            "banner_max_length": BANNER_MESSAGE_MAX_LENGTH,
            "downtime_at": downtime_at,
            "countdown_overdue": bool(downtime_at and downtime_at <= timezone.now()),
            "max_countdown_minutes": MAX_COUNTDOWN_MINUTES,
            "feature_flags": json.dumps(current.get("feature_flags") or {}, indent=2),
            # Without the current values, saving would overwrite them blind.
            "error": error,
        },
    )
