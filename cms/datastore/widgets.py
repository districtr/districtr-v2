"""
Filterable-table pickers: one control for everywhere the CMS selects map
modules (and a map module's overlays). A search box plus per-column
dropdown filters over a table of rows, driven by the `table-picker`
Stimulus controller (datastore/static/datastore/table_picker.js, loaded
globally by datastore/wagtail_hooks.py).

The widget only renders the field's choices — scoping stays in the form
field's choices/queryset, which is also what validates the POST.

The value travels in one hidden input (a value, or a JSON list when
``multiple``) so the widget also works inside StreamField blocks, where
Wagtail's telepath adapter reads and writes a single ``[name]`` input.
"""

import json

from django import forms
from django.db import DatabaseError, transaction


class TablePickerWidget(forms.HiddenInput):
    template_name = "datastore/widgets/table_picker.html"
    # A visible control, not a hidden field: keep labels/wrappers rendering.
    is_hidden = False
    noun = "items"
    # (row key, header) — the first column is the item's name.
    columns = ()
    # (row key, "All …" option); a row may carry "<key>Label" for display.
    filters = ()

    def __init__(self, attrs=None, multiple=False, ordered=False):
        super().__init__(attrs)
        self.multiple = multiple
        self.ordered = ordered
        self.choices = []

    def format_value(self, value):
        if self.multiple:
            return json.dumps([str(v) for v in (value or [])])
        return "" if value is None else str(value)

    def value_from_datadict(self, data, files, name):
        if not self.multiple:
            return data.get(name)
        # The picker posts one JSON list; plain repeated values (no-JS
        # posts, tests: name=a&name=b or a dict of lists) are accepted too.
        values = data.getlist(name) if hasattr(data, "getlist") else data.get(name)
        if values is None:
            return []
        if isinstance(values, str):
            values = [values]
        if len(values) == 1:
            try:
                parsed = json.loads(values[0])
            except (TypeError, ValueError):
                parsed = None
            if isinstance(parsed, list):
                values = parsed
        return [str(v) for v in values if str(v)]

    def row_data(self, values):
        """{value: row dict} for the given choice values."""
        raise NotImplementedError

    def _rows(self):
        choices = [(str(v), str(label)) for v, label in self.choices if str(v)]
        try:
            # Savepoint: the mirror tables don't exist in test databases.
            with transaction.atomic():
                data = self.row_data([v for v, _ in choices])
        except DatabaseError:
            data = {}
        # Unknown values (a saved slug whose module is gone) keep their label.
        return [
            {"value": value, **data.get(value, {"name": label})}
            for value, label in choices
        ]

    def get_context(self, name, value, attrs):
        context = super().get_context(name, value, attrs)
        context["widget"]["config"] = {
            "multiple": self.multiple,
            "ordered": self.ordered,
            "noun": self.noun,
            "columns": self.columns,
            "filters": self.filters,
            "rows": self._rows(),
        }
        return context


class MapModulePickerWidget(TablePickerWidget):
    noun = "modules"
    columns = (
        ("name", "Name"),
        ("state", "State"),
        ("boundary", "Boundary"),
        ("districts", "Districts"),
        ("slug", "Slug"),
        ("description", "Description"),
    )
    filters = (("state", "All states"), ("boundary", "All boundary types"))

    def __init__(self, *args, lookup="slug", **kwargs):
        """``lookup`` says what the choice values are: "slug"
        (districtr_map_slug) or "pk" (ModelChoiceField uuids)."""
        super().__init__(*args, **kwargs)
        self.lookup = lookup

    def row_data(self, values):
        from datastore.models import DistrictrMap

        field = "districtr_map_slug" if self.lookup == "slug" else "pk"
        maps = DistrictrMap.objects.filter(**{f"{field}__in": values}).values(
            "pk",
            "districtr_map_slug",
            "name",
            "state_abbr",
            "state_name",
            "boundary_type",
            "num_districts",
            "description",
        )
        return {
            str(m[field]): {
                "name": m["name"],
                "slug": m["districtr_map_slug"],
                "state": m["state_abbr"] or "",
                "stateLabel": (
                    f"{m['state_name']} ({m['state_abbr']})"
                    if m["state_name"] and m["state_abbr"]
                    else m["state_abbr"] or ""
                ),
                "boundary": m["boundary_type"] or "",
                "districts": m["num_districts"],
                "description": m["description"] or "",
            }
            for m in maps
        }


class OverlayPickerWidget(TablePickerWidget):
    """Choice values are Overlay pks."""

    noun = "overlays"
    columns = (
        ("name", "Name"),
        ("layer", "Layer"),
        ("data", "Data"),
        ("file", "File"),
        ("description", "Description"),
    )
    filters = (("layer", "All layer types"), ("data", "All data types"))

    def row_data(self, values):
        from datastore.models import Overlay

        return {
            str(o.pk): {
                "name": o.name,
                "layer": o.get_layer_type_display(),
                "data": o.get_data_type_display(),
                "file": (o.source or "").rstrip("/").rsplit("/", 1)[-1],
                "description": o.description or "",
            }
            for o in Overlay.objects.filter(pk__in=values)
        }
