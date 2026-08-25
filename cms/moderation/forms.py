"""Filter form for the submission moderation queue (GET form, all fields
optional). Blank choices mean "don't filter" — services._clean drops them so
the backend applies no filter for that dimension."""

from django import forms

TRISTATE_CHOICES = [("", "All"), ("1", "Yes"), ("0", "No")]

STATUS_CHOICES = [
    ("", "All"),
    ("submitted", "Submitted"),
    ("draft", "Draft (map started, not yet submitted)"),
]


def _tristate(value):
    return {"1": "true", "0": "false"}.get(value)


class SubmissionFilterForm(forms.Form):
    status = forms.ChoiceField(choices=STATUS_CHOICES, required=False)
    flagged = forms.ChoiceField(
        choices=[("", "All"), ("1", "Flagged only")], required=False
    )
    nsfw = forms.ChoiceField(choices=TRISTATE_CHOICES, required=False, label="NSFW")
    hidden = forms.ChoiceField(choices=TRISTATE_CHOICES, required=False)

    def backend_params(self) -> dict:
        d = self.cleaned_data
        return {
            "status": d["status"],
            "flagged": "true" if d["flagged"] == "1" else None,
            "nsfw": _tristate(d["nsfw"]),
            "hidden": _tristate(d["hidden"]),
        }
