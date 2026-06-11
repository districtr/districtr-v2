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
