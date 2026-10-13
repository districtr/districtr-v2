"""Team-aware page permissions for content pages.

Wagtail and wagtail-localize gate most page views on the page's permission
tester (edit, history, revisions, preview, translation), so team scope is
enforced here rather than only in a handful of hooks:

- Out of scope (content/scoping.py): every capability is denied, even for
  the page's owner.
- In scope, on a PortalPage: a member of an administering team who holds
  add_page under it (partners do, on the Portals index) may edit it like its
  owner. Ownership is per user, and a portal belongs to its teams.

PlacePages get the denial only: a place page can feature several teams'
modules, so module overlap is not ownership.
"""

from wagtail.models import PagePermissionTester

from authapi.teams import user_is_team_scoped
from content.scoping import page_out_of_scope

# Every capability the tester exposes, besides can_edit (handled below).
_DENIED_OUT_OF_SCOPE = (
    "can_add_subpage",
    "can_delete",
    "can_unpublish",
    "can_publish",
    "can_submit_for_moderation",
    "can_set_view_restrictions",
    "can_unschedule",
    "can_lock",
    "can_unlock",
    "can_publish_subpage",
    "can_reorder_children",
    "can_move",
    "can_copy",
    "can_move_to",
    "can_copy_to",
    "can_view_revisions",
)


class TeamScopedPagePermissionTester(PagePermissionTester):
    def __init__(self, user, page):
        super().__init__(user, page)
        scoped = user.is_active and user_is_team_scoped(user)
        self.out_of_scope = scoped and page_out_of_scope(user, page)
        self.team_editor = (
            scoped
            and not self.out_of_scope
            and page.specific_class.__name__ == "PortalPage"
            and "add" in self.permissions
        )

    def can_edit(self):
        if self.out_of_scope:
            return False
        return self.team_editor or super().can_edit()


def _deny_out_of_scope(name):
    base = getattr(PagePermissionTester, name)

    def method(self, *args, **kwargs):
        if self.out_of_scope:
            return False
        return base(self, *args, **kwargs)

    method.__name__ = name
    return method


for _name in _DENIED_OUT_OF_SCOPE:
    setattr(TeamScopedPagePermissionTester, _name, _deny_out_of_scope(_name))
