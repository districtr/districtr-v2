"""
Team-based Wagtail admin scoping (see authapi.models.Team).

A non-admin user who belongs to one or more Teams is "team-scoped": the admin
listings/editing for portal forms, tag pages, and Districtr map modules are
narrowed to their teams' resources. Superusers and members of the `admin`
group are never scoped; a non-admin user with no team keeps their role's
default (unscoped) access.

Each resource reaches a Team differently:
- DistrictrMap relates through TeamDistrictrMap (team_links);
- TagPage relates indirectly through districtr_map_slug -> DistrictrMap ->
  TeamDistrictrMap;
- FormConfig (submission moderation) carries team slugs in admin_teams.

so the per-resource queryset filters live with each resource's wagtail_hooks;
this module only answers "is this user scoped, and to which teams".
"""

from functools import cached_property

from django.http import Http404
from wagtail.permission_policies.base import ModelPermissionPolicy

from authapi.models import TeamMembership


def user_is_unscoped_admin(user) -> bool:
    """True for superusers and admin-group members — the only users the
    team-scoping machinery never narrows. Everyone else is restricted to
    their teams; a non-admin with NO team must fail closed (see the
    FormConfig policy), not inherit admin reach."""
    if not user.is_authenticated:
        return False
    return user.is_superuser or user.groups.filter(name="admin").exists()


def user_is_team_scoped(user) -> bool:
    """True when ``user``'s Wagtail admin should be narrowed to their teams
    (see module docstring for who is exempt)."""
    if not user.is_authenticated or user_is_unscoped_admin(user):
        return False
    return TeamMembership.objects.filter(user=user).exists()


def team_ids_for_user(user) -> set[int]:
    """The pks of every Team ``user`` belongs to (the ORM scoping unit)."""
    return set(
        TeamMembership.objects.filter(user=user).values_list("team_id", flat=True)
    )


def team_slugs_for_user(user) -> list[str]:
    """Slugs of every Team ``user`` belongs to, sorted.

    Minted into the JWT `teams` claim and matched by the backend against
    form_configs.admin_teams to scope submission moderation per portal
    (backend/app/submissions/main.py::require_portal_admin). Renaming a team
    is safe; changing its slug invalidates members' access until re-login.
    """
    from authapi.models import Team

    return sorted(
        Team.objects.filter(memberships__user=user).values_list("slug", flat=True)
    )


def districtr_map_slugs_for_user(user) -> set[str]:
    """districtr_map_slugs of the DistrictrMaps assigned to the user's teams.

    A TagPage is in the user's scope exactly when its ``districtr_map_slug`` is
    in this set (TagPage -> DistrictrMap by slug -> TeamDistrictrMap). Imported
    lazily to keep authapi free of a load-time dependency on datastore.
    """
    from datastore.models import DistrictrMap

    return set(
        DistrictrMap.objects.filter(
            team_links__team__memberships__user=user
        ).values_list("districtr_map_slug", flat=True)
    )


def instance_in_scope(user, model, team_filter_field, pk) -> bool:
    """False exactly when a team-scoped ``user`` may not act on ``model`` row
    ``pk``. Unscoped users (admins, superusers, team-less) always pass."""
    if not user_is_team_scoped(user):
        return True
    return scoped_queryset(model, team_filter_field, user).filter(pk=pk).exists()


def scoped_queryset(model, team_filter_field, user):
    """``model`` rows belonging to one of ``user``'s teams.

    ``team_filter_field`` is the ORM lookup from the model to Team's pk,
    e.g. ``team_links__team_id``
    (DistrictrMap, via TeamDistrictrMap).
    """
    team_ids = team_ids_for_user(user)
    return model._default_manager.filter(
        **{f"{team_filter_field}__in": team_ids}
    ).distinct()


class TeamScopedModelPermissionPolicy(ModelPermissionPolicy):
    """Model permissions, plus: a team-scoped user may only act on instances
    belonging to their teams. Admins / superusers / team-less users are
    unaffected (full model-permission behaviour).

    Used for resources a member may *edit*. ``team_filter_field``
    is the lookup passed to :func:`scoped_queryset`.
    """

    def __init__(self, model, *, team_filter_field):
        super().__init__(model)
        self.team_filter_field = team_filter_field

    def instances_user_has_permission_for(self, user, action):
        instances = super().instances_user_has_permission_for(user, action)
        if user_is_team_scoped(user):
            scoped = scoped_queryset(self.model, self.team_filter_field, user)
            return instances.filter(pk__in=scoped.values("pk"))
        return instances

    def user_has_permission_for_instance(self, user, action, instance):
        if not super().user_has_permission_for_instance(user, action, instance):
            return False
        if user_is_team_scoped(user):
            return (
                scoped_queryset(self.model, self.team_filter_field, user)
                .filter(pk=instance.pk)
                .exists()
            )
        return True


class TeamScopedViewGrantPermissionPolicy(TeamScopedModelPermissionPolicy):
    """Like :class:`TeamScopedModelPermissionPolicy`, but additionally grants
    *view*/*inspect* to team members — scoped to their teams — even without a
    Django view permission. Write actions (add/change/delete) still require the
    Django permission, so admins keep editing and members cannot.

    Used for resources a member may *see* but not edit (e.g. DistrictrMap
    modules, which admins/super partners manage but each team should be able
    to browse for its own assignments).
    """

    _VIEW_ACTIONS = {"view", "inspect"}

    def user_has_permission(self, user, action):
        if action in self._VIEW_ACTIONS and user_is_team_scoped(user):
            return True
        return super().user_has_permission(user, action)

    def instances_user_has_permission_for(self, user, action):
        if action in self._VIEW_ACTIONS and user_is_team_scoped(user):
            return scoped_queryset(self.model, self.team_filter_field, user)
        return super().instances_user_has_permission_for(user, action)

    def user_has_permission_for_instance(self, user, action, instance):
        if action in self._VIEW_ACTIONS and user_is_team_scoped(user):
            return (
                scoped_queryset(self.model, self.team_filter_field, user)
                .filter(pk=instance.pk)
                .exists()
            )
        return super().user_has_permission_for_instance(user, action, instance)


class TeamScopedViewSetMixin:
    """SnippetViewSet mixin: index queryset and permission policy scoped to the
    user's teams. Set ``team_filter_field``; override
    ``permission_policy_class`` for view-grant behaviour."""

    team_filter_field: str
    permission_policy_class = TeamScopedModelPermissionPolicy

    def get_queryset(self, request):
        if user_is_team_scoped(request.user):
            return scoped_queryset(self.model, self.team_filter_field, request.user)
        return None

    @cached_property
    def permission_policy(self):
        return self.permission_policy_class(
            self.model, team_filter_field=self.team_filter_field
        )


class TeamScopedGetObjectMixin:
    """For snippet object views that fetch straight from the model with no
    instance permission check (Inspect/History/Usage/Copy): 404 when a
    team-scoped member addresses an out-of-scope object by URL. Set
    ``team_filter_field`` on the view subclass."""

    team_filter_field: str

    def get_object(self, queryset=None):
        obj = super().get_object(queryset)
        if not instance_in_scope(
            self.request.user, self.model, self.team_filter_field, obj.pk
        ):
            raise Http404
        return obj
