"""Shared admin-menu building block: group-gated menu items."""

from wagtail.admin.menu import MenuItem


class GroupMenuItem(MenuItem):
    """Menu item shown only to superusers and members of ``groups``.

    The linked views enforce their own gates server-side; this only keeps
    links a user could not use out of their menu.
    """

    def __init__(self, *args, groups, **kwargs):
        self.groups = groups
        super().__init__(*args, **kwargs)

    def is_shown(self, request):
        user = request.user
        if user.is_superuser:
            return True
        return user.groups.filter(name__in=self.groups).exists()
