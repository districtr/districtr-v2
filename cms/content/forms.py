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

import json

from django import forms
from wagtail.admin.forms import WagtailAdminPageForm

from authapi.teams import (
    districtr_map_slugs_for_user,
    user_is_team_scoped,
    user_is_unscoped_admin,
)
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


def _admin_only_reason(child, *, portal_page):
    """Why a non-admin may not add/change this body block, or None.

    Galleries that list beyond the page's own portal (the whole site, other
    portals — and "this portal" off a portal page, which resolves to the
    whole site) would let a partner present any plan on the site as theirs.
    """
    if child.block_type == "plan_gallery":
        source = child.value["source"]
        if source in ("all", "portals") or (
            source == "this_portal" and not portal_page
        ):
            return (
                "Only admins can make a plan gallery list the whole site or "
                "other portals. Choose "
                + ('"This portal\'s submissions" or ' if portal_page else "")
                + '"Specific maps (by ID)".'
            )
    return None


def _block_key(child):
    return child.block_type, json.dumps(
        child.block.get_prep_value(child.value), sort_keys=True, default=str
    )


def admin_only_violation(body, original, *, user, portal_page):
    """The first reason ``user`` may not save ``body``, or None.

    Admins may do anything. Everyone else can't add or change admin-only
    blocks; ones already on the page (``original``, placed by an admin) pass
    through untouched, and removing them is fine.
    """
    if user is None or user_is_unscoped_admin(user):
        return None
    before = {child.id: _block_key(child) for child in original or []}
    for child in body or []:
        reason = _admin_only_reason(child, portal_page=portal_page)
        if reason and before.get(child.id) != _block_key(child):
            return reason
    return None


class AdminOnlyBlocksMixin:
    portal_page = False

    def clean(self):
        cleaned_data = super().clean()
        # clean() runs before the instance is updated, so its body is still
        # the page as last saved.
        original = self.instance.body if self.instance.pk else None
        reason = admin_only_violation(
            cleaned_data.get("body"),
            original,
            user=self.for_user,
            portal_page=self.portal_page,
        )
        if reason:
            self.add_error("body", reason)
        return cleaned_data


class PortalPageForm(AdminOnlyBlocksMixin, WagtailAdminPageForm):
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


class PlacePageForm(AdminOnlyBlocksMixin, WagtailAdminPageForm):
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
