"""The portal creation wizard: pick a preset, make two decisions, done.

Creating a portal by hand takes four disconnected steps (add a TagPage under
the Tags index, remember the body blocks, create a matching FormConfig row,
get the slugs to agree). The wizard does all of it in one transaction from a
PRESET: a draft TagPage with a starter body, the FormConfig (collection mode,
form fields), and any custom questions. The page lands as a draft in the page
editor for staff review before publishing — pages keep review; submissions
don't.

The two real decisions (per the product spec):
1. How are map submissions collected? (collection_mode)
2. What information does the form ask for? (registry fields + custom
   questions — only relevant for the prompt/form modes)

Gated by PORTAL_EDITOR_GROUPS (portals/views.py); team-scoped members
get their teams' map modules as choices and their teams preselected as
submission admins.
"""

import json

from django import forms
from django.db import IntegrityError, transaction
from django.forms import formset_factory
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils.text import slugify
from wagtail.admin import messages
from wagtail.models import Locale

from authapi.models import Team
from authapi.teams import (
    districtr_map_slugs_for_user,
    team_slugs_for_user,
    user_is_unscoped_admin,
)
from content.forms import _map_choices
from datastore.models import (
    COLLECTION_MODE_CHOICES,
    SUBMISSION_FIELD_CHOICES,
    DistrictrMap,
    FormConfig,
    FormFieldCustom,
)

DEFAULT_FIELDS = [
    "first_name",
    "last_name",
    "email",
    "title",
    "comment",
    "place",
    "state",
    "zip_code",
]
DEFAULT_REQUIRED = ["first_name", "email", "title", "comment"]
ALL_FIELDS = [choice for choice, _label in SUBMISSION_FIELD_CHOICES]

# The preset table: each pre-fills the collection mode, form fields, and
# starter body. Presets are a starting point — the posted values win, and
# everything stays editable afterwards (page editor / Portal forms snippet).
PORTAL_PRESETS = {
    "educational": {
        "label": "Educational",
        "description": (
            "Workshops and classrooms: participants draw maps from the portal "
            "and organizers watch them come in on an internal gallery. "
            "Nothing is published."
        ),
        "collection_mode": "internal",
        "fields": [],
        "required_fields": [],
        "require_email_confirm": False,
        "body": "maps_only",
    },
    "competition": {
        "label": "Competition",
        "description": (
            "Map contests: entrants are prompted to submit when they mark "
            "their map ready to share, filling a short entry form. Submitted "
            "snapshots are frozen."
        ),
        "collection_mode": "prompt",
        "fields": DEFAULT_FIELDS,
        "required_fields": DEFAULT_REQUIRED,
        "require_email_confirm": False,
        "body": "map_collection",
    },
    "public_engagement": {
        "label": "Public engagement",
        "description": (
            "Open participation: every map drawn from the portal appears in "
            "the public gallery as soon as it is in progress or ready to "
            "share. No form to fill."
        ),
        "collection_mode": "auto_public",
        "fields": [],
        "required_fields": [],
        "require_email_confirm": False,
        "body": "auto_gallery",
    },
    "state_commission": {
        "label": "State commission",
        "description": (
            "Formal testimony: a full submission form (all standard fields, "
            "email confirmation) with an optional map attachment, plus a "
            "gallery of written submissions."
        ),
        "collection_mode": "form",
        "fields": ALL_FIELDS,
        "required_fields": DEFAULT_REQUIRED,
        "require_email_confirm": True,
        "body": "testimony",
    },
    "custom": {
        "label": "Custom",
        "description": "Start from a plain testimony portal and adjust everything below.",
        "collection_mode": "prompt",
        "fields": DEFAULT_FIELDS,
        "required_fields": DEFAULT_REQUIRED,
        "require_email_confirm": False,
        "body": "testimony",
    },
}

INTRO_PLACEHOLDER = (
    "<p>Introduce your portal here: what you are collecting, who should "
    "participate, and any deadlines.</p>"
)


def _starter_body(
    body_kind: str, *, title: str, slug: str, map_slug: str, map_name: str
):
    """Starter StreamField body per preset body kind, as raw block data."""
    header = {"type": "section_header", "value": {"title": title}}
    intro = {"type": "rich_text", "value": INTRO_PLACEHOLDER}
    map_buttons = {
        "type": "map_create_buttons",
        "value": {
            "views": [{"name": map_name, "districtr_map_slug": map_slug}],
            "type": "cards",
        },
    }
    form_block = {
        "type": "form",
        "value": {"mandatoryTags": [], "allowListModules": []},
    }
    # tags=[slug]: with no curated ids these galleries list entries tagged
    # with the portal's own tag — submissions appear automatically.
    plan_gallery = {"type": "plan_gallery", "value": {"ids": [], "tags": [slug]}}
    comment_gallery = {"type": "comment_gallery", "value": {"ids": [], "tags": [slug]}}

    if body_kind == "maps_only":
        # Internal collection: no form, no public gallery on the page.
        return [header, intro, map_buttons]
    if body_kind == "auto_gallery":
        return [header, intro, map_buttons, plan_gallery]
    if body_kind == "map_collection":
        return [header, intro, map_buttons, form_block, plan_gallery]
    # testimony
    return [header, intro, form_block, comment_gallery]


class CustomQuestionForm(forms.Form):
    label = forms.CharField(max_length=255, required=False, label="Question")
    field_type = forms.ChoiceField(
        choices=[("text", "Short answer"), ("textarea", "Paragraph")],
        initial="text",
        required=False,
    )
    required = forms.BooleanField(required=False)


CustomQuestionFormSet = formset_factory(CustomQuestionForm, extra=3)


class PortalWizardForm(forms.Form):
    preset = forms.ChoiceField(
        choices=[(key, spec["label"]) for key, spec in PORTAL_PRESETS.items()],
        initial="custom",
        widget=forms.RadioSelect,
        label="What kind of portal is this?",
    )
    title = forms.CharField(max_length=255, help_text="The portal page's title.")
    slug = forms.SlugField(
        required=False,
        help_text="URL slug (also the portal's tag). Left blank, it is "
        "derived from the title.",
    )
    districtr_map_slug = forms.ChoiceField(label="Map module")
    collection_mode = forms.ChoiceField(
        choices=COLLECTION_MODE_CHOICES,
        initial="prompt",
        widget=forms.RadioSelect,
        label="How are map submissions collected?",
    )
    fields = forms.MultipleChoiceField(
        choices=SUBMISSION_FIELD_CHOICES,
        widget=forms.CheckboxSelectMultiple,
        initial=DEFAULT_FIELDS,
        required=False,
        label="Form fields",
        help_text="Which fields the submission form shows — only used by the "
        "prompt-to-submit and manual-form modes.",
    )
    required_fields = forms.MultipleChoiceField(
        choices=SUBMISSION_FIELD_CHOICES,
        widget=forms.CheckboxSelectMultiple,
        initial=DEFAULT_REQUIRED,
        required=False,
        help_text="Must be a subset of the form fields.",
    )
    require_email_confirm = forms.BooleanField(
        required=False,
        help_text="Ask submitters to confirm their email address. "
        "(Verification emails are not sent yet.)",
    )
    admin_teams = forms.MultipleChoiceField(
        widget=forms.CheckboxSelectMultiple,
        required=False,
        help_text="Teams whose members administer this portal's submissions.",
    )

    def __init__(self, *args, user, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = user
        # Restricted = every non-admin, INCLUDING team-less partners: they
        # get empty map/team choices (fail closed) rather than admin reach.
        restricted = not user_is_unscoped_admin(user)
        user_teams = team_slugs_for_user(user)
        self.fields["districtr_map_slug"].choices = [("", "---------")] + _map_choices(
            limit_to=districtr_map_slugs_for_user(user) if restricted else None
        )
        if restricted:
            team_choices = Team.objects.filter(slug__in=user_teams)
        else:
            team_choices = Team.objects.all()
        self.fields["admin_teams"].choices = [
            (team.slug, team.name) for team in team_choices.order_by("name")
        ]
        self.fields["admin_teams"].initial = user_teams

    def clean(self):
        cleaned = super().clean()
        slug = cleaned.get("slug") or slugify(cleaned.get("title") or "")
        if not slug:
            self.add_error("slug", "A slug is required.")
            return cleaned
        cleaned["slug"] = slug

        parent = _tags_index()
        if parent is None:
            raise forms.ValidationError(
                "The Tags index page is missing — run content provisioning first."
            )
        cleaned["parent"] = parent
        if parent.get_children().filter(slug=slug).exists():
            self.add_error("slug", f"A portal with slug '{slug}' already exists.")
        if FormConfig.objects.filter(portal_id=slug).exists():
            self.add_error("slug", f"A form config for portal '{slug}' already exists.")

        extra = set(cleaned.get("required_fields") or []) - set(
            cleaned.get("fields") or []
        )
        if extra:
            self.add_error(
                "required_fields",
                f"Required fields must also be shown: {', '.join(sorted(extra))}",
            )

        if not user_is_unscoped_admin(self.user):
            chosen = set(cleaned.get("admin_teams") or [])
            if not chosen & set(team_slugs_for_user(self.user)):
                self.add_error(
                    "admin_teams",
                    "Pick at least one of your own teams to moderate this " "portal.",
                )
        return cleaned


def _tags_index():
    from content.models import TagsIndexPage

    return TagsIndexPage.objects.filter(locale=Locale.get_default()).first()


def portal_wizard(request):
    # Group gate applied at URL registration (portals/wagtail_hooks.py) to
    # keep the PORTAL_EDITOR_GROUPS constant in one place.
    form = PortalWizardForm(request.POST or None, user=request.user)
    question_formset = CustomQuestionFormSet(request.POST or None, prefix="questions")
    if request.method == "POST" and form.is_valid() and question_formset.is_valid():
        from content.models import TagPage

        data = form.cleaned_data
        slug = data["slug"]
        preset = PORTAL_PRESETS[data["preset"]]
        # The display name, not the choice label ("Name (slug)") — the label
        # would leak into the starter page's visible button text.
        map_name = (
            DistrictrMap.objects.filter(districtr_map_slug=data["districtr_map_slug"])
            .values_list("name", flat=True)
            .first()
            or data["districtr_map_slug"]
        )
        body = _starter_body(
            preset["body"],
            title=data["title"],
            slug=slug,
            map_slug=data["districtr_map_slug"],
            map_name=map_name,
        )
        try:
            with transaction.atomic():
                page = TagPage(
                    title=data["title"],
                    slug=slug,
                    districtr_map_slug=data["districtr_map_slug"],
                    body=json.dumps(body),
                    live=False,
                )
                data["parent"].add_child(instance=page)
                page.save_revision(user=request.user)
                FormConfig.objects.create(
                    portal_id=slug,
                    name=data["title"],
                    collection_mode=data["collection_mode"],
                    fields=data["fields"],
                    required_fields=data["required_fields"],
                    require_email_confirm=data["require_email_confirm"],
                    admin_teams=data["admin_teams"],
                )
                for order, question in enumerate(question_formset.cleaned_data):
                    label = (question.get("label") or "").strip()
                    if not label:
                        continue
                    key = f"custom_{slugify(label).replace('-', '_')}"[:64]
                    FormFieldCustom.objects.create(
                        form_config_id=slug,
                        key=key,
                        label=label,
                        field_type=question.get("field_type") or "text",
                        required=bool(question.get("required")),
                        sort_order=order,
                    )
        except IntegrityError:
            # The clean() existence checks are advisory (TOCTOU against a
            # concurrent create); the loser gets a form error, not a 500.
            form.add_error("slug", f"A portal '{slug}' was just created.")
            return render(request, "content/portal_wizard.html", {"form": form})
        messages.success(
            request,
            f"Portal '{data['title']}' created as a draft with its form "
            "config. Review the page and publish when ready.",
        )
        return redirect(reverse("wagtailadmin_pages:edit", args=[page.id]))

    # data-* payloads for the tiny prefill script in the template.
    preset_data = {
        key: {
            "description": spec["description"],
            "collection_mode": spec["collection_mode"],
            "fields": spec["fields"],
            "required_fields": spec["required_fields"],
            "require_email_confirm": spec["require_email_confirm"],
        }
        for key, spec in PORTAL_PRESETS.items()
    }
    return render(
        request,
        "content/portal_wizard.html",
        {
            "form": form,
            "question_formset": question_formset,
            "preset_data_json": json.dumps(preset_data),
        },
    )
