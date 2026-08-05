"""Filter forms for the moderation queues (GET forms, all fields optional).

Values mirror backend/app/comments/models.py::ReviewStatus; the blank choice
means "not yet reviewed" (the backend filters review_status IS NULL when the
param is omitted — services._clean drops blanks). REVIEWED displays as
"Dismissed", matching the legacy Next.js UI.
"""

import re

from django import forms

REVIEW_STATUS_CHOICES = [
    ("", "Not yet reviewed"),
    ("APPROVED", "Approved"),
    ("REJECTED", "Rejected"),
    ("REVIEWED", "Dismissed"),
]

# A ChoiceField (not a checkbox) so an unsubmitted GET form and an explicit
# "All" are distinguishable, and so the district page can default to
# "Flagged only" on first render.
FLAGGED_CHOICES = [("", "All"), ("1", "Flagged only")]


class CommentFilterForm(forms.Form):
    review_status = forms.ChoiceField(
        choices=REVIEW_STATUS_CHOICES,
        required=False,
        label="Review status",
    )
    flagged = forms.ChoiceField(choices=FLAGGED_CHOICES, required=False, label="Flagged")
    tags = forms.CharField(
        required=False,
        help_text="Tag slugs, comma or space separated",
    )
    comment_id = forms.IntegerField(required=False, label="Comment ID")
    place = forms.CharField(required=False)
    state = forms.CharField(required=False)
    zip_code = forms.CharField(required=False, label="Zip code")

    def clean_tags(self):
        return [t for t in re.split(r"[,\s]+", self.cleaned_data["tags"]) if t]

    def backend_params(self) -> dict:
        d = self.cleaned_data
        return {
            "review_status": d["review_status"],
            "review_flagged": "true" if d["flagged"] == "1" else None,
            "tags": d["tags"],
            "comment_id": d["comment_id"],
            "place": d["place"],
            "state": d["state"],
            "zip_code": d["zip_code"],
        }


class DistrictCommentFilterForm(forms.Form):
    document_id = forms.CharField(required=False, label="Document ID (UUID)")
    public_id = forms.IntegerField(required=False, label="Public map ID")
    comment_id = forms.IntegerField(required=False, label="Comment ID")
    flagged = forms.ChoiceField(choices=FLAGGED_CHOICES, required=False, label="Flagged")
    review_status = forms.ChoiceField(
        choices=REVIEW_STATUS_CHOICES,
        required=False,
        label="Review status",
    )

    def backend_params(self) -> dict:
        d = self.cleaned_data
        return {
            "document_id": d["document_id"],
            "public_id": d["public_id"],
            "comment_id": d["comment_id"],
            "review_flagged": "true" if d["flagged"] == "1" else None,
            "review_status": d["review_status"],
        }
