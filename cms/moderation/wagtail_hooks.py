"""Admin registration for the moderation views: URLs under /admin/moderation/,
one top-level "Review" submenu (portal comments, flagged queue, map
submissions), and a Settings-menu entry for site settings."""

from django.urls import path, reverse
from wagtail import hooks
from wagtail.admin.menu import Menu, MenuItem, SubmenuMenuItem

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
        path("moderation/comments/", views.comments, name="moderation_comments"),
        path(
            "moderation/review/", views.review_action, name="moderation_review_action"
        ),
        path(
            "moderation/map-submissions/",
            views.map_submissions,
            name="moderation_map_submissions",
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
    # One action-oriented "Review" group right after Galleries (210).
    # SubmenuMenuItem self-hides when no child is shown for the request.
    return SubmenuMenuItem(
        "Review",
        Menu(
            items=[
                GroupMenuItem(
                    "Review comments",
                    reverse("moderation_comments"),
                    icon_name="comment",
                    order=1,
                    groups=COMMENT_REVIEW_GROUPS,
                ),
                GroupMenuItem(
                    # Direct jump to the flagged queue — the same comments
                    # view, pre-filtered.
                    "Flagged comments",
                    reverse("moderation_comments") + "?flagged=1",
                    icon_name="warning",
                    order=2,
                    groups=COMMENT_REVIEW_GROUPS,
                ),
                GroupMenuItem(
                    "Review map submissions",
                    reverse("moderation_map_submissions"),
                    icon_name="clipboard-list",
                    order=3,
                    groups=COMMENT_REVIEW_GROUPS,
                ),
            ]
        ),
        icon_name="glasses",
        order=220,
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
