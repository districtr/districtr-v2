"""Shared test factories for the cms test suites.

One definition each for the user/team/portal/mirror-table helpers that every
app's tests need (previously duplicated per test module).
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.db import connection
from django.utils.text import slugify

PASSWORD = "correct-horse-battery-staple"


def make_user(group_name=None, email="user@districtr.org", *, access_admin=False):
    """A user, optionally in a group and/or holding Wagtail admin access."""
    user = get_user_model().objects.create_user(
        username=email, email=email, password=PASSWORD, first_name="Test"
    )
    if group_name:
        user.groups.add(Group.objects.get(name=group_name))
    if access_admin:
        user.user_permissions.add(
            Permission.objects.get(
                content_type__app_label="wagtailadmin", codename="access_admin"
            )
        )
    return user


def make_admin_user(email="dataops@districtr.org", group_name="admin"):
    """A user who can enter the Wagtail admin, in the given group."""
    return make_user(group_name, email, access_admin=True)


def make_team(name, *, members=(), maps=()):
    """A Team with memberships and (optionally) assigned map modules.

    ``maps`` items may be DistrictrMap instances or bare uuids — the FK is
    db_constraint=False, so a uuid works even without the mirror table.
    """
    from authapi.models import Team, TeamDistrictrMap, TeamMembership
    from datastore.models import DistrictrMap

    team = Team.objects.create(name=name, slug=slugify(name))
    for user in members:
        TeamMembership.objects.create(team=team, user=user)
    for districtr_map in maps:
        if isinstance(districtr_map, DistrictrMap):
            TeamDistrictrMap.objects.create(team=team, districtr_map=districtr_map)
        else:
            TeamDistrictrMap.objects.create(team=team, districtr_map_id=districtr_map)
    return team


def make_portal(slug, *, districtr_map_slug="chi_wards", title=None):
    """A TagPage under the provisioned tags index (content/0002_provision_site)."""
    from content.models import TagPage, TagsIndexPage

    index = TagsIndexPage.objects.first()
    portal = TagPage(
        title=title or slug.replace("-", " ").title(),
        slug=slug,
        districtr_map_slug=districtr_map_slug,
    )
    index.add_child(instance=portal)
    return portal


def create_mirror_tables(*models):
    """Build the managed=False datastore mirrors inside the test transaction
    (their tables live in the Alembic-owned public schema in real databases,
    so the Django test database never creates them)."""
    with connection.schema_editor() as editor:
        for model in models:
            editor.create_model(model)
