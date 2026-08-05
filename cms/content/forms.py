"""
Team-aware admin forms for content pages: for a team-scoped member
(authapi/teams.py) the Districtr-map-slug field is narrowed to their teams'
maps, with at least one required. Admins and team-less users keep the
unrestricted free-text field.

Shared PlacePages (in scope on *any* overlap) may also carry other teams' maps;
those slugs are neither offered nor removable, and clean() re-merges them in
their original positions so saving never drops another team's association.
"""

from django import forms
from wagtail.admin.forms import WagtailAdminPageForm

from authapi.teams import districtr_map_slugs_for_user, user_is_team_scoped

_HELP_TEXT = "Only Districtr maps your team owns are listed."


class _TeamScopedSlugFormBase(WagtailAdminPageForm):
    """Swaps the free-text map-slug field for a choice field limited to the
    team-scoped member's maps. The choice field itself is the guard —
    out-of-choices submissions fail validation."""

    slug_field: str
    field_class = forms.ChoiceField

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.for_user and user_is_team_scoped(self.for_user):
            self._scoped_slugs = districtr_map_slugs_for_user(self.for_user)
            original = self.fields[self.slug_field]
            self.fields[self.slug_field] = self.field_class(
                choices=[(slug, slug) for slug in sorted(self._scoped_slugs)],
                required=True,
                label=original.label,
                help_text=_HELP_TEXT,
            )
        else:
            self._scoped_slugs = None


class TagPageForm(_TeamScopedSlugFormBase):
    slug_field = "districtr_map_slug"


class PlacePageForm(_TeamScopedSlugFormBase):
    slug_field = "districtr_map_slugs"
    field_class = forms.MultipleChoiceField

    def clean(self):
        cleaned_data = super().clean()
        if self._scoped_slugs is not None:
            # Preserve the curated order and other teams' maps: keep the
            # original sequence minus this member's deselections, then append
            # their additions.
            original = list(self.instance.districtr_map_slugs or [])
            chosen = cleaned_data.get(self.slug_field) or []
            merged = [
                slug
                for slug in original
                if slug in chosen or slug not in self._scoped_slugs
            ]
            merged += [slug for slug in chosen if slug not in original]
            cleaned_data[self.slug_field] = merged
        return cleaned_data
