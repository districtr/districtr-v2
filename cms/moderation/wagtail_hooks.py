"""Admin registration for what remains of the moderation app: the
site-settings page. The review queues were retired — submissions are public
by default, and takedown lives on the Portals hub's per-portal gallery
(portals/)."""

from django.urls import path, reverse
from wagtail import hooks

from core.menu import GroupMenuItem
from moderation import views
from moderation.views import SITE_SETTINGS_GROUPS


@hooks.register("register_admin_urls")
def register_moderation_admin_urls():
    return [
        path(
            "moderation/site-settings/",
            views.site_settings,
            name="moderation_site_settings",
        ),
    ]


@hooks.register("register_settings_menu_item")
def register_site_settings_menu_item():
    return GroupMenuItem(
        "Frontend settings",
        reverse("moderation_site_settings"),
        icon_name="cog",
        order=900,
        groups=SITE_SETTINGS_GROUPS,
    )
