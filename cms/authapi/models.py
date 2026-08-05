"""
Per-user review scoping.

A reviewer with one or more ReviewTagAssignment rows may only moderate
comments carrying those tags on the FastAPI moderation endpoints
(backend/app/comments/main.py). The limitation rides in the JWT:
DistrictrTokenObtainPairSerializer mints a `review_tags` claim (the sorted
list of the user's assigned slugs) and scopes_for_user strips the blanket
`read:read-all` scope, which would otherwise signal unrestricted read.

A user with NO assignments gets NO `review_tags` claim — that means
unrestricted review (back-compat for internal reviewers).
"""

from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models
from modelcluster.fields import ParentalKey
from modelcluster.models import ClusterableModel

# Matches the slugified tag format produced by the comments service
# (backend slugify_tag: lowercase alphanumerics, hyphens, underscores).
tag_slug_validator = RegexValidator(
    regex=r"^[a-z0-9-_]+$",
    message="Use the slugified tag: lowercase letters, digits, hyphens, underscores.",
)


class ReviewTagAssignment(models.Model):
    """Limits a reviewer to comments carrying tag_slug.

    Managed by admins in the Wagtail admin ("Review tag scopes" snippet,
    authapi/wagtail_hooks.py). Takes effect at the user's next login (claims
    are minted on the refresh token at token obtain, not on refresh).
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="review_tag_assignments",
    )
    tag_slug = models.CharField(
        max_length=255,
        validators=[tag_slug_validator],
        help_text=(
            "Slug of a comment tag in the comments service "
            "(e.g. 'environment'). The reviewer may only moderate comments "
            "carrying at least one assigned tag."
        ),
    )

    class Meta:
        unique_together = [("user", "tag_slug")]

    def __str__(self):
        return f"{self.user.get_username()} → {self.tag_slug}"


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
