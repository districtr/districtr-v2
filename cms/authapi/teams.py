"""
Team-based Wagtail admin scoping (see authapi.models.Team).

A non-admin user who belongs to one or more Teams is "team-scoped": the admin
listings/editing for galleries, tag pages, and Districtr map modules are
narrowed to the MapGroups their teams own. Superusers and members of the
`admin` group are never scoped; a non-admin user with no team keeps their
role's default (unscoped) access.

Each resource reaches a MapGroup differently:
- Gallery.map_group is a direct FK;
- DistrictrMap relates through DistrictrMapsToGroups (group_links);
- TagPage relates indirectly through districtr_map_slug -> DistrictrMap ->
  DistrictrMapsToGroups.

so the per-resource queryset filters live with each resource's wagtail_hooks;
this module only answers "is this user scoped, and to which group slugs".
"""

from wagtail.permission_policies.base import ModelPermissionPolicy

from authapi.models import TeamMapGroup, TeamMembership


def user_is_team_scoped(user) -> bool:
    """True when ``user``'s Wagtail admin should be narrowed to their teams.

    Superusers and the ``admin`` group are never scoped. A non-admin user is
    scoped exactly when they belong to at least one Team.
    """
    if not user.is_authenticated or user.is_superuser:
        return False
    if user.groups.filter(name="admin").exists():
        return False
    return TeamMembership.objects.filter(user=user).exists()


def map_group_slugs_for_user(user) -> set[str]:
    """The set of MapGroup slugs across every Team ``user`` belongs to."""
    return set(
        TeamMapGroup.objects.filter(team__memberships__user=user).values_list(
            "map_group_id", flat=True
        )
    )


def districtr_map_slugs_for_user(user) -> set[str]:
    """districtr_map_slugs of the DistrictrMaps in the user's teams' groups.

    A TagPage is in the user's scope exactly when its ``districtr_map_slug`` is
    in this set (TagPage -> DistrictrMap by slug -> DistrictrMapsToGroups ->
    MapGroup). Imported lazily to keep authapi free of a load-time dependency on
    datastore.
    """
    from datastore.models import DistrictrMap

    return set(
        DistrictrMap.objects.filter(
            group_links__group_id__in=map_group_slugs_for_user(user)
        ).values_list("districtr_map_slug", flat=True)
    )


def scoped_queryset(model, group_filter_field, user):
    """``model`` rows whose MapGroup one of ``user``'s teams owns.

    ``group_filter_field`` is the ORM lookup from the model to MapGroup's pk
    (a slug), e.g. ``map_group_id`` (Gallery, direct FK) or
    ``group_links__group_id`` (DistrictrMap, via DistrictrMapsToGroups).
    """
    slugs = map_group_slugs_for_user(user)
    return model._default_manager.filter(
        **{f"{group_filter_field}__in": slugs}
    ).distinct()


class TeamScopedModelPermissionPolicy(ModelPermissionPolicy):
    """Model permissions, plus: a team-scoped user may only act on instances
    whose MapGroup their teams own. Admins / superusers / team-less users are
    unaffected (full model-permission behaviour).

    Used for resources a member may *edit* (e.g. Gallery). ``group_filter_field``
    is the lookup passed to :func:`scoped_queryset`.
    """

    def __init__(self, model, *, group_filter_field):
        super().__init__(model)
        self.group_filter_field = group_filter_field

    def instances_user_has_permission_for(self, user, action):
        instances = super().instances_user_has_permission_for(user, action)
        if user_is_team_scoped(user):
            scoped = scoped_queryset(self.model, self.group_filter_field, user)
            return instances.filter(pk__in=scoped.values("pk"))
        return instances

    def user_has_permission_for_instance(self, user, action, instance):
        if not super().user_has_permission_for_instance(user, action, instance):
            return False
        if user_is_team_scoped(user):
            return (
                scoped_queryset(self.model, self.group_filter_field, user)
                .filter(pk=instance.pk)
                .exists()
            )
        return True


class TeamScopedViewGrantPermissionPolicy(TeamScopedModelPermissionPolicy):
    """Like :class:`TeamScopedModelPermissionPolicy`, but additionally grants
    *view*/*inspect* to team members — scoped to their groups — even without a
    Django view permission. Write actions (add/change/delete) still require the
    Django permission, so admins keep editing and members cannot.

    Used for resources a member may *see* but not edit (e.g. DistrictrMap
    modules, which only admins manage but each team should be able to browse
    for its own groups).
    """

    _VIEW_ACTIONS = {"view", "inspect"}

    def user_has_permission(self, user, action):
        if action in self._VIEW_ACTIONS and user_is_team_scoped(user):
            return True
        return super().user_has_permission(user, action)

    def instances_user_has_permission_for(self, user, action):
        if action in self._VIEW_ACTIONS and user_is_team_scoped(user):
            return scoped_queryset(self.model, self.group_filter_field, user)
        return super().instances_user_has_permission_for(user, action)

    def user_has_permission_for_instance(self, user, action, instance):
        if action in self._VIEW_ACTIONS and user_is_team_scoped(user):
            return (
                scoped_queryset(self.model, self.group_filter_field, user)
                .filter(pk=instance.pk)
                .exists()
            )
        return super().user_has_permission_for_instance(user, action, instance)
