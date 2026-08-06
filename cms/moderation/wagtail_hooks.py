"""Admin registration for the moderation views: URLs under /admin/moderation/,
one top-level "Review" item (pick a portal, review its comment and map
submissions), and a Settings-menu entry for site settings."""

from django.urls import path, reverse
from wagtail import hooks
from wagtail.admin.menu import MenuItem

from moderation import views
from moderation.views import COMMENT_REVIEW_GROUPS, SITE_SETTINGS_GROUPS


class GroupMenuItem(MenuItem):
    """Menu item shown only to superusers and members of ``groups``.

    The views enforce the same gate server-side; this only keeps links a
    user's token could only 403 on out of their menu.
    """

    def __init__(self, *args, groups, **kwargs):
        self.groups = groups
        super().__init__(*args, **kwargs)

    def is_shown(self, request):
        user = request.user
        if user.is_superuser:
            return True
        return user.groups.filter(name__in=self.groups).exists()


@hooks.register("register_admin_urls")
def register_moderation_admin_urls():
    # Mounted under /admin/ and wrapped in require_admin_access by Wagtail;
    # the views additionally require their moderation group.
    return [
        path(
            "moderation/portals/",
            views.review_portals,
            name="moderation_review_portals",
        ),
        path(
            "moderation/portals/<slug:slug>/",
            views.portal_review,
            name="moderation_portal_review",
        ),
        path(
            "moderation/review/", views.review_action, name="moderation_review_action"
        ),
        path(
            "moderation/add-to-gallery/",
            views.add_to_gallery,
            name="moderation_add_to_gallery",
        ),
        path(
            "moderation/site-settings/",
            views.site_settings,
            name="moderation_site_settings",
        ),
    ]


@hooks.register("register_admin_menu_item")
def register_review_menu_item():
    # One action: pick a portal, review its submissions (comments or maps).
    # Ordered right after Galleries (210).
    return GroupMenuItem(
        "Review",
        reverse("moderation_review_portals"),
        icon_name="glasses",
        order=220,
        groups=COMMENT_REVIEW_GROUPS,
    )


@hooks.register("register_settings_menu_item")
def register_site_settings_menu_item():
    return GroupMenuItem(
        "Frontend settings",
        reverse("moderation_site_settings"),
        icon_name="cog",
        order=900,
        groups=SITE_SETTINGS_GROUPS,
    )
