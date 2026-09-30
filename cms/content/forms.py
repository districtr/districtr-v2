"""
Admin forms for content pages: the Districtr-map fields use the shared
map-module picker (datastore/widgets.py) — single-select on PortalPage, an
orderable multi-select on PlacePage (the saved order is the display order on
the public place page).

Team scoping (authapi/teams.py): a team-scoped member's choices are narrowed
to their teams' maps — the choice set itself is the guard. Shared PlacePages (in scope on *any* overlap) may also carry other
teams' maps; those slugs are neither offered nor removable, and clean()
re-inserts them at their original positions so saving never drops another
team's association.
"""

from django import forms
from wagtail.admin.forms import WagtailAdminPageForm

from authapi.teams import districtr_map_slugs_for_user, user_is_team_scoped
from content.blocks import districtr_map_slug_choices
from datastore.widgets import MapModulePickerWidget

_SCOPED_HELP_TEXT = "Only Districtr maps your team owns are listed."


def _map_choices(limit_to=None, ensure=()):
    """(slug, "Name (slug)") choices from the DistrictrMap mirror.

    ``limit_to`` narrows to a team's slugs; ``ensure`` keeps slugs already
    saved on the page selectable even when the module no longer exists, so
    opening the editor can't silently drop them.
    """
    choices = districtr_map_slug_choices()
    if limit_to is not None:
        choices = [(slug, label) for slug, label in choices if slug in limit_to]
    known = {slug for slug, _ in choices}
    choices += [
        (slug, f"{slug} (missing module)")
        for slug in ensure
        if slug and slug not in known
    ]
    return choices


def has_portal_gallery(body):
    """True when a body carries a submissions gallery, which lists the
    page's own portal and so only works on a portal page."""
    return any(child.block_type == "plan_gallery" for child in body or [])


class ContentPageForm(WagtailAdminPageForm):
    """Base form for the content pages."""

    portal_page = False

    def clean(self):
        cleaned_data = super().clean()
        if not self.portal_page and has_portal_gallery(cleaned_data.get("body")):
            self.add_error(
                "body",
                "Only portal pages can list portal submissions. Use a Curated "
                "gallery here instead.",
            )
        return cleaned_data


class PortalPageForm(ContentPageForm):
    portal_page = True

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        scoped = (
            districtr_map_slugs_for_user(self.for_user)
            if self.for_user and user_is_team_scoped(self.for_user)
            else None
        )
        current = getattr(self.instance, "districtr_map_slug", "") or ""
        original = self.fields["districtr_map_slug"]
        self.fields["districtr_map_slug"] = forms.ChoiceField(
            choices=[("", "---------")]
            + _map_choices(limit_to=scoped, ensure=[current] if scoped is None else ()),
            widget=MapModulePickerWidget(),
            # Optional: portals offer their modules through the page's
            # map_create_buttons block now (the wizard leaves this blank);
            # the field remains for legacy portal pages that still carry it.
            required=False,
            label=original.label,
            help_text=_SCOPED_HELP_TEXT if scoped is not None else original.help_text,
        )


class PlacePageForm(ContentPageForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.for_user and user_is_team_scoped(self.for_user):
            self._scoped_slugs = districtr_map_slugs_for_user(self.for_user)
            choices = _map_choices(limit_to=self._scoped_slugs)
            required, help_text = True, _SCOPED_HELP_TEXT
        else:
            self._scoped_slugs = None
            choices = _map_choices(ensure=list(self.instance.districtr_map_slugs or []))
            required, help_text = (
                False,
                ("Modules shown on this place page, in this order."),
            )
        original = self.fields["districtr_map_slugs"]
        # MultipleChoiceField keeps the submitted (picker) order.
        self.fields["districtr_map_slugs"] = forms.MultipleChoiceField(
            choices=choices,
            widget=MapModulePickerWidget(multiple=True, ordered=True),
            required=required,
            label=original.label,
            help_text=help_text,
        )

    def clean(self):
        cleaned_data = super().clean()
        if self._scoped_slugs is not None:
            # The member's submitted order wins for their own maps; other
            # teams' maps (never offered in the widget) are re-inserted at
            # their original positions.
            original = list(self.instance.districtr_map_slugs or [])
            merged = list(cleaned_data.get("districtr_map_slugs") or [])
            for index, slug in enumerate(original):
                if slug not in self._scoped_slugs and slug not in merged:
                    merged.insert(min(index, len(merged)), slug)
            cleaned_data["districtr_map_slugs"] = merged
        return cleaned_data
