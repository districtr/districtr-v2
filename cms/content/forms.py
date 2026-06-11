"""
Team-aware admin forms for content pages.

When a team-scoped member (authapi/teams.py) creates or edits a TagPage or
PlacePage, the Districtr-map-slug field is narrowed to the maps their teams own
and at least one is required — so a member can't attach a map outside their
groups (which they'd immediately lose sight of via the explorer scoping in
content/wagtail_hooks.py). Admins and team-less users keep the unrestricted
free-text field.

`for_user` is supplied by Wagtail's page create/edit views to the page form.
"""

from django import forms
from wagtail.admin.forms import WagtailAdminPageForm

from authapi.teams import districtr_map_slugs_for_user, user_is_team_scoped


def _scoped_slug_choices(user):
    return [(slug, slug) for slug in sorted(districtr_map_slugs_for_user(user))]


class TagPageForm(WagtailAdminPageForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.for_user and user_is_team_scoped(self.for_user):
            field = self.fields["districtr_map_slug"]
            self.fields["districtr_map_slug"] = forms.ChoiceField(
                choices=_scoped_slug_choices(self.for_user),
                required=True,
                label=field.label,
                help_text="Only Districtr maps your team owns are listed.",
            )

    def clean(self):
        cleaned_data = super().clean()
        if self.for_user and user_is_team_scoped(self.for_user):
            slug = cleaned_data.get("districtr_map_slug")
            if slug and slug not in districtr_map_slugs_for_user(self.for_user):
                self.add_error(
                    "districtr_map_slug", "Choose a Districtr map your team owns."
                )
        return cleaned_data


class PlacePageForm(WagtailAdminPageForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.for_user and user_is_team_scoped(self.for_user):
            field = self.fields["districtr_map_slugs"]
            self.fields["districtr_map_slugs"] = forms.MultipleChoiceField(
                choices=_scoped_slug_choices(self.for_user),
                required=True,
                label=field.label,
                help_text="Only Districtr maps your team owns are listed.",
            )

    def clean(self):
        cleaned_data = super().clean()
        if self.for_user and user_is_team_scoped(self.for_user):
            chosen = set(cleaned_data.get("districtr_map_slugs") or [])
            out_of_scope = chosen - districtr_map_slugs_for_user(self.for_user)
            if out_of_scope:
                self.add_error(
                    "districtr_map_slugs",
                    "Not your team's maps: " + ", ".join(sorted(out_of_scope)) + ".",
                )
        return cleaned_data
