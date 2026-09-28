"""
Admin forms for content pages: the Districtr-map fields are proper selectors
everywhere — a dropdown of map modules on TagPage, and an orderable
multi-select on PlacePage (the saved order is the display order on the
public place page).

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


class OrderedSlugSelectWidget(forms.Widget):
    """Multi-select that keeps an explicit order: chosen modules render as a
    list with move-up/move-down/remove controls plus an add dropdown, posted
    as repeated hidden inputs (getlist preserves submission order)."""

    template_name = "content/widgets/ordered_slug_select.html"

    def __init__(self, attrs=None, choices=()):
        super().__init__(attrs)
        self.choices = list(choices)

    def get_context(self, name, value, attrs):
        context = super().get_context(name, value, attrs)
        selected = [str(v) for v in (value or [])]
        labels = dict(self.choices)
        context["widget"]["selected"] = [(v, labels.get(v, v)) for v in selected]
        context["widget"]["options"] = [
            (v, label) for v, label in self.choices if v not in selected
        ]
        return context

    def value_from_datadict(self, data, files, name):
        if hasattr(data, "getlist"):
            return data.getlist(name)
        value = data.get(name)
        if value is None:
            return []
        return list(value) if isinstance(value, (list, tuple)) else [value]


class OrderedMultipleChoiceField(forms.MultipleChoiceField):
    """MultipleChoiceField whose cleaned value preserves submission order."""

    widget = OrderedSlugSelectWidget


class TagPageForm(WagtailAdminPageForm):
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
            # Optional: portals offer their modules through the page's
            # map_create_buttons block now (the wizard leaves this blank);
            # the field remains for legacy tag pages that still carry it.
            required=False,
            label=original.label,
            help_text=_SCOPED_HELP_TEXT if scoped is not None else original.help_text,
        )


class PlacePageForm(WagtailAdminPageForm):
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
        self.fields["districtr_map_slugs"] = OrderedMultipleChoiceField(
            choices=choices,
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
