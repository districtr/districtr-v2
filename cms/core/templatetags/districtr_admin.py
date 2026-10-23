from django import template

from core.menu import in_groups

register = template.Library()


@register.filter
def is_districtr_admin(user):
    """Superusers and admin-group members: the only users who get the raw
    page tree (see core.wagtail_hooks.trim_main_menu)."""
    return in_groups(user, ("admin",))
