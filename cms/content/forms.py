"""
Admin forms for content pages: PlacePage's Districtr-map field uses the
shared map-module picker (datastore/widgets.py) as an orderable multi-select
(the saved order is the display order on the public place page). Every
content page form guards what non-admins may put in the body
(admin_only_violation).

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


def has_portal_gallery(body):
    """True when a body carries a submissions gallery, which lists the
    page's own portal and so only works on a portal page."""
    return any(child.block_type == "plan_gallery" for child in body or [])


def _block_key(child):
    return child.block_type, json.dumps(
        child.block.get_prep_value(child.value), sort_keys=True, default=str
    )


def _module_slugs(body):
    """Map module slugs referenced by a body's create buttons and forms."""
    slugs = set()
    for child in body or []:
        if child.block_type == "map_create_buttons":
            slugs.update(view["districtr_map_slug"] for view in child.value["views"])
        elif child.block_type == "form":
            slugs.update(child.value["allowListModules"])
    return slugs


def admin_only_violation(body, original, *, user):
    """The first reason ``user`` may not save ``body``, or None.

    Admins may do anything. Everyone else can't add or change the
    About-the-data boilerplate (admin copy for state landing pages), nor add
    map modules outside their teams; whatever is already on the page
    (``original``, placed by an admin) passes through untouched, and
    removing it is fine.
    """
    if user is None or user_is_unscoped_admin(user):
        return None
    before = {child.id: _block_key(child) for child in original or []}
    for child in body or []:
        if child.block_type == "boilerplate" and before.get(child.id) != _block_key(
            child
        ):
            return "Only admins can add or edit the About-the-data boilerplate."
    added = _module_slugs(body) - _module_slugs(original)
    foreign = added - set(districtr_map_slugs_for_user(user)) if added else set()
    if foreign:
        return "Only your team's map modules can be added: " + ", ".join(
            sorted(foreign)
        )
    return None


class ContentPageForm(WagtailAdminPageForm):
    """Base form for the content pages."""

    portal_page = False

    def clean(self):
        cleaned_data = super().clean()
        body = cleaned_data.get("body")
        if not self.portal_page and has_portal_gallery(body):
            self.add_error(
                "body",
                "Only portal pages can list portal submissions. Use a Curated "
                "gallery here instead.",
            )
        # clean() runs before the instance is updated, so its body is still
        # the page as last saved.
        reason = admin_only_violation(
            body, self.instance.body if self.instance.pk else None, user=self.for_user
        )
        if reason:
            self.add_error("body", reason)
        return cleaned_data


class PortalPageForm(ContentPageForm):
    portal_page = True


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
