"""The portal creation wizard: answer a few questions, get a portal.

Creating a portal by hand takes four disconnected steps (add a TagPage under
the Tags index, remember the body blocks, create a matching FormConfig row,
get the slugs to agree). The wizard does all of it in one transaction from a
short, paginated questionnaire: title, URL, how maps are collected, which map
modules to offer, and the submission form's fields (including unlimited
custom questions). The templated page body is generated from those answers —
a draft TagPage in the page editor for staff review before publishing.
Pages keep review; submissions don't.

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

# Wizard-facing framing of FormConfig.collection_mode: "are maps collected,
# and if so how?" Values are the COLLECTION_MODE_CHOICES values verbatim.
MAP_COLLECTION_CHOICES = [
    ("auto_public", "Automatically collect and publish maps."),
    (
        "prompt",
        "Users should be prompted to submit their map on completion, with an "
        "optional short form.",
    ),
    ("form", "Users must complete a form on the portal."),
    ("internal", "Do not publish maps. Only collect an admin gallery I can see."),
]
# Modes where mapmaking is the point: the portal must offer map modules.
MAP_COLLECTING_MODES = {"prompt", "auto_public", "internal"}
# Modes where submitters never see a form: the wizard skips the form step
# and ignores any form answers rather than requiring them.
AUTO_COLLECTED_MODES = {"internal", "auto_public"}

INTRO_PLACEHOLDER = (
    "<p>Introduce your portal here: what you are collecting, who should "
    "participate, and any deadlines.</p>"
)


def _starter_body(mode: str, *, title: str, slug: str, views: list[dict]):
    """The templated StreamField body, generated from the answers.

    Map modules render as a create-buttons card grid (there is no
    single-map block anymore — portals routinely offer several modules).
    """
    body = [
        {"type": "section_header", "value": {"title": title}},
        {"type": "rich_text", "value": INTRO_PLACEHOLDER},
    ]

    # Each section opens with its own header so the generated page reads as
    # distinct sections; editors rename or delete them like any other block.
    def _section(header_title):
        return {"type": "section_header", "value": {"title": header_title}}

    if views:
        body += [
            _section("Draw a map"),
            {"type": "map_create_buttons", "value": {"views": views, "type": "cards"}},
        ]
    if mode in ("prompt", "form"):
        body += [
            _section("Make a submission"),
            {"type": "form", "value": {"mandatoryTags": [], "allowListModules": []}},
        ]
    # tags=[slug]: with no curated ids these galleries list entries tagged
    # with the portal's own tag — submissions appear automatically.
    if mode in ("prompt", "auto_public"):
        body += [
            _section("Map gallery"),
            {"type": "plan_gallery", "value": {"ids": [], "tags": [slug]}},
        ]
    elif mode == "form":
        body += [
            _section("Submissions"),
            {"type": "comment_gallery", "value": {"ids": [], "tags": [slug]}},
        ]
    return body


class CustomQuestionForm(forms.Form):
    label = forms.CharField(max_length=255, required=False, label="Question")
    field_type = forms.ChoiceField(
        choices=[("text", "Short answer"), ("textarea", "Paragraph")],
        initial="text",
        required=False,
    )
    required = forms.BooleanField(required=False)


# extra=1: the template's "Add question" button clones empty_form, so the
# number of questions is unbounded.
CustomQuestionFormSet = formset_factory(CustomQuestionForm, extra=1)


class PortalWizardForm(forms.Form):
    title = forms.CharField(max_length=255, help_text="The portal page's title.")
    slug = forms.SlugField(
        required=False,
        label="URL",
        help_text="The portal's web address: districtr.org/portal/<this>. "
        "Letters, numbers, and dashes. Left blank, it is derived from the "
        "title.",
    )
    collection_mode = forms.ChoiceField(
        choices=MAP_COLLECTION_CHOICES,
        initial="prompt",
        widget=forms.RadioSelect,
        label="How do you want to collect and publish maps created through "
        "this portal?",
    )
    map_modules = forms.MultipleChoiceField(
        widget=forms.CheckboxSelectMultiple,
        required=False,
        label="Map modules",
        help_text="Each module gets a 'draw a map' card on the portal page. "
        "Required unless the portal only collects written testimony.",
    )
    fields = forms.MultipleChoiceField(
        choices=SUBMISSION_FIELD_CHOICES,
        widget=forms.CheckboxSelectMultiple,
        initial=DEFAULT_FIELDS,
        required=False,
        label="Form fields",
        help_text="Which fields the submission form shows — only used when "
        "submitters fill a form (the prompt and written-testimony answers).",
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
        self.fields["map_modules"].choices = _map_choices(
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
            self.add_error("slug", "A URL is required.")
            return cleaned
        cleaned["slug"] = slug

        parent = _tags_index()
        if parent is None:
            raise forms.ValidationError(
                "The Tags index page is missing — run content provisioning first."
            )
        cleaned["parent"] = parent
        if parent.get_children().filter(slug=slug).exists():
            self.add_error("slug", f"A portal at '{slug}' already exists.")
        if FormConfig.objects.filter(portal_id=slug).exists():
            self.add_error("slug", f"A form config for portal '{slug}' already exists.")

        if cleaned.get("collection_mode") in MAP_COLLECTING_MODES and not cleaned.get(
            "map_modules"
        ):
            self.add_error(
                "map_modules",
                "Pick at least one map module — this portal collects maps.",
            )

        # Auto-collected portals never show a form, so form answers are
        # neither required nor kept — whatever the (skipped) step held is
        # cleared rather than validated.
        if cleaned.get("collection_mode") in AUTO_COLLECTED_MODES:
            cleaned["fields"] = []
            cleaned["required_fields"] = []
            cleaned["require_email_confirm"] = False

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


def _question_rows(question_formset):
    """Validated (key, label, field_type, required) rows from the formset.

    Key derivation mirrors CustomFieldInlineFormSet: 'custom_' + slugified
    label. Duplicate or empty-slug labels get a formset-level error HERE —
    letting them reach the DB's UNIQUE/CHECK constraints would surface as a
    misleading 'portal was just created' message (or a 500).
    """
    rows = []
    seen: set[str] = set()
    for question in question_formset.cleaned_data:
        label = (question.get("label") or "").strip()
        if not label:
            continue
        slug_part = slugify(label).replace("-", "_")
        if not slug_part:
            question_formset._non_form_errors = question_formset.non_form_errors()
            question_formset._non_form_errors.append(
                f"Question label '{label}' must contain letters or numbers."
            )
            continue
        key = f"custom_{slug_part}"[:64]
        if key in seen:
            question_formset._non_form_errors = question_formset.non_form_errors()
            question_formset._non_form_errors.append(
                f"Two questions would share the key '{key}' — make the "
                "labels distinct."
            )
            continue
        seen.add(key)
        rows.append(
            (
                key,
                label,
                question.get("field_type") or "text",
                bool(question.get("required")),
            )
        )
    return rows


def portal_wizard(request):
    # Group gate applied at URL registration (portals/wagtail_hooks.py) to
    # keep the PORTAL_EDITOR_GROUPS constant in one place.
    form = PortalWizardForm(request.POST or None, user=request.user)
    question_formset = CustomQuestionFormSet(request.POST or None, prefix="questions")

    def _render():
        return render(
            request,
            "content/portal_wizard.html",
            {
                "form": form,
                "question_formset": question_formset,
                # A POST re-render means errors somewhere: show every step at
                # once so nothing stays hidden behind the stepper.
                "paginate": request.method != "POST",
            },
        )

    if request.method == "POST" and form.is_valid() and question_formset.is_valid():
        from content.models import TagPage

        data = form.cleaned_data
        slug = data["slug"]
        question_rows = (
            []
            if data["collection_mode"] in AUTO_COLLECTED_MODES
            else _question_rows(question_formset)
        )
        if question_formset.non_form_errors():
            return _render()
        # Display names, not choice labels ("Name (slug)") — labels would
        # leak into the page's visible card text. Order follows the choices.
        names = dict(
            DistrictrMap.objects.filter(
                districtr_map_slug__in=data["map_modules"]
            ).values_list("districtr_map_slug", "name")
        )
        views = [
            {"name": names.get(map_slug) or map_slug, "districtr_map_slug": map_slug}
            for map_slug in data["map_modules"]
        ]
        body = _starter_body(
            data["collection_mode"], title=data["title"], slug=slug, views=views
        )
        try:
            with transaction.atomic():
                # districtr_map_slug (the single-map field) is deliberately
                # left blank: portals often offer several modules, so the
                # create-buttons block is the module surface now.
                page = TagPage(
                    title=data["title"],
                    slug=slug,
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
                for order, (key, label, field_type, required) in enumerate(
                    question_rows
                ):
                    FormFieldCustom.objects.create(
                        form_config_id=slug,
                        key=key,
                        label=label,
                        field_type=field_type,
                        required=required,
                        sort_order=order,
                    )
        except IntegrityError:
            # The clean() existence checks are advisory (TOCTOU against a
            # concurrent create); the loser gets a form error, not a 500.
            form.add_error("slug", f"A portal '{slug}' was just created.")
            return _render()
        messages.success(
            request,
            f"Portal '{data['title']}' created as a draft with its form "
            "config. Review the page and publish when ready.",
        )
        return redirect(reverse("wagtailadmin_pages:edit", args=[page.id]))

    return _render()
