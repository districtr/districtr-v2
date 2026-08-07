"""
Teams: the partner-organization boundary of the CMS (see authapi/teams.py).
"""

from django.conf import settings
from django.db import models
from modelcluster.fields import ParentalKey
from modelcluster.models import ClusterableModel


class Team(ClusterableModel):
    """A partner organization — the access-control boundary of the CMS.

    Team membership scopes a non-admin user's Wagtail admin to their teams'
    resources: the galleries a team owns (Gallery.team), the Districtr map
    modules assigned to it (TeamDistrictrMap), and the tag/place pages tied
    to those modules (authapi/teams.py). Admins and superusers are never
    scoped, nor are non-admin users with no team. Managed by admins in the
    "Teams" snippet (authapi/wagtail_hooks.py).

    The slug is minted into the JWT `teams` claim at login and matched by
    the galleries API for group_only galleries — renaming a team is safe,
    changing its slug invalidates members' access until re-login.
    """

    name = models.CharField(max_length=255, unique=True)
    slug = models.SlugField(
        max_length=255,
        unique=True,
        help_text=(
            "Stable identifier, minted into members' JWT `teams` claim. "
            "Changing it revokes group_only gallery access until re-login."
        ),
    )

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class TeamMembership(models.Model):
    """A user's membership in a Team (InlinePanel child of Team)."""

    team = ParentalKey(Team, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="team_memberships",
    )

    class Meta:
        unique_together = [("team", "user")]

    def __str__(self):
        return f"{self.user.get_username()} ∈ {self.team.name}"


class TeamDistrictrMap(models.Model):
    """A Districtr map module assigned to a Team (InlinePanel child of Team).

    Direct assignment — MapGroup is a listing facet, not an access boundary.
    db_constraint=False because DistrictrMap is a managed=False mirror of a
    backend-owned table in the public schema.
    """

    team = ParentalKey(Team, on_delete=models.CASCADE, related_name="districtr_maps")
    districtr_map = models.ForeignKey(
        "datastore.DistrictrMap",
        on_delete=models.DO_NOTHING,
        db_constraint=False,
        related_name="team_links",
    )

    class Meta:
        unique_together = [("team", "districtr_map")]

    def __str__(self):
        return f"{self.team.name} → {self.districtr_map_id}"
