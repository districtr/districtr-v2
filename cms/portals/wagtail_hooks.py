"""Admin registration for the Portals hub: /admin/portals/* and the top-level
"Portals" menu item. This is the portal-first surface — make a portal
(wizard), see its gallery (which doubles as the takedown surface; there is no
review workflow for submissions), and its map metrics."""

from django.urls import path, reverse
from django.views.generic import RedirectView
from wagtail import hooks
from wagtail.admin.auth import user_passes_test

from content.portal_wizard import portal_wizard
from core.menu import GroupMenuItem
from portals import views
from portals.views import PORTAL_EDITOR_GROUPS


def _is_portal_editor(user):
    return (
        user.is_superuser or user.groups.filter(name__in=PORTAL_EDITOR_GROUPS).exists()
    )


@hooks.register("register_admin_urls")
def register_portals_admin_urls():
    # Mounted under /admin/ and wrapped in require_admin_access by Wagtail;
    # the views additionally require a portal-editor group (and the backend
    # re-checks teams×admin_teams on every data call).
    gate = user_passes_test(_is_portal_editor)
    return [
        path("portals/", views.portals_index, name="portals_index"),
        path("portals/new/", gate(portal_wizard), name="content_portal_wizard"),
        path(
            "portals/<slug:slug>/gallery/",
            views.portal_gallery,
            name="portals_gallery",
        ),
        path(
            "portals/<slug:slug>/metrics/",
            views.portal_metrics,
            name="portals_metrics",
        ),
        path(
            "portals/<slug:slug>/metrics/<int:public_id>.json",
            views.portal_metrics_row,
            name="portals_metrics_row",
        ),
        path(
            "portals/action/",
            views.submission_action,
            name="portals_submission_action",
        ),
        path(
            "portals/add-to-gallery/",
            views.add_to_portal_gallery,
            name="portals_add_to_gallery",
        ),
        # The retired review queue's bookmark-friendly redirect.
        path(
            "moderation/portals/",
            RedirectView.as_view(pattern_name="portals_index", permanent=False),
        ),
    ]


class PortalsMenuItem(GroupMenuItem):
    """Resolves the hub URL lazily, at first menu render."""

    def is_shown(self, request):
        self.url = reverse("portals_index")
        return super().is_shown(request)


@hooks.register("register_admin_menu_item")
def register_portals_menu_item():
    # Right after the dashboard: portals are the primary admin workflow.
    return PortalsMenuItem(
        "Portals",
        url="",
        icon_name="tag",
        order=100,
        groups=PORTAL_EDITOR_GROUPS,
    )
