"""Which content pages a team-scoped user may act on.

One predicate, used by the page permission tester (content/permissions.py)
and the explorer/mutation hooks (content/wagtail_hooks.py), so every admin
view agrees. A PortalPage is in scope when its portal's FormConfig names one
of the user's teams (resolved through the default-locale translation, see
PortalPage.portal_id). A PlacePage is in scope when it features a map module
one of the user's teams holds. Other pages carry no team association.
"""

from authapi.teams import (
    districtr_map_slugs_for_user,
    portal_slugs_for_user,
    user_is_team_scoped,
)


def page_out_of_scope(user, page) -> bool:
    """True when a team-scoped user is acting on a content page outside their
    teams. Admins and non-content pages are never out of scope."""
    from content.models import PlacePage, PortalPage

    if not user_is_team_scoped(user):
        return False
    specific = page.specific
    if isinstance(specific, PortalPage):
        return specific.portal_id not in portal_slugs_for_user(user)
    if isinstance(specific, PlacePage):
        return districtr_map_slugs_for_user(user).isdisjoint(
            specific.districtr_map_slugs
        )
    return False


def in_scope_portal_translation_keys(user):
    """translation_keys of the portals ``user``'s teams administer, covering
    every locale of each portal."""
    from wagtail.models import Locale

    from content.models import PortalPage

    return PortalPage.objects.filter(
        locale=Locale.get_default(), slug__in=list(portal_slugs_for_user(user))
    ).values("translation_key")
