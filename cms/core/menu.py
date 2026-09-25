"""Group gating shared by admin menu items and the views they link to, so
"who counts as a portal editor" is spelled once."""

from wagtail.admin.auth import user_passes_test
from wagtail.admin.menu import MenuItem


def in_groups(user, groups) -> bool:
    """Superusers, and members of any of ``groups``."""
    return user.is_superuser or user.groups.filter(name__in=groups).exists()


def group_required(groups):
    """View decorator for in_groups; otherwise Wagtail's standard
    permission-denied response (redirect to admin home with an error)."""
    return user_passes_test(lambda user: in_groups(user, groups))


class GroupMenuItem(MenuItem):
    """Menu item shown only to superusers and members of ``groups``.

    The linked views enforce their own gates server-side; this only keeps
    links a user could not use out of their menu.
    """

    def __init__(self, *args, groups, **kwargs):
        self.groups = groups
        super().__init__(*args, **kwargs)

    def is_shown(self, request):
        return in_groups(request.user, self.groups)
