"""The portal creation wizard: one page, three sections, two objects.

Creating a portal by hand takes four disconnected steps (add a TagPage under
the Tags index, remember the body blocks, create a matching FormConfig row,
get the slugs to agree). The wizard does all of it in one transaction from a
starter template: a draft TagPage with sensible body blocks plus the
FormConfig whose portal_id is the page slug. The page lands as a draft in
the page editor for review; publishing goes through the normal workflow.

Gated by PORTAL_EDITOR_GROUPS (content/wagtail_hooks.py); team-scoped members
get their teams' map modules as choices and their teams preselected as
submission admins.
"""

import json

from django import forms
from django.db import transaction
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils.text import slugify
from wagtail.admin import messages
from wagtail.models import Locale

from authapi.models import Team
from authapi.teams import (
    districtr_map_slugs_for_user,
    team_slugs_for_user,
    user_is_team_scoped,
)
from content.forms import _map_choices
from datastore.models import SUBMISSION_FIELD_CHOICES, FormConfig

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

TEMPLATE_CHOICES = [
    (
        "testimony",
        "Testimony portal — intro, submission form, and a gallery of "
        "written submissions",
    ),
    (
        "map_collection",
        "Map collection portal — map-create buttons, submission form, and a "
        "plan gallery of submitted maps",
    ),
    ("minimal", "Minimal — just the submission form"),
]

INTRO_PLACEHOLDER = (
    "<p>Introduce your portal here: what you are collecting, who should "
    "participate, and any deadlines.</p>"
)


def _starter_body(template: str, *, title: str, slug: str, map_slug: str, map_name: str):
    """Starter StreamField body per template, as raw block data."""
    form_block = {"type": "form", "value": {"mandatoryTags": [], "allowListModules": []}}
    if template == "minimal":
        return [form_block]
    header = {"type": "section_header", "value": {"title": title}}
    intro = {"type": "rich_text", "value": INTRO_PLACEHOLDER}
    if template == "map_collection":
        return [
            header,
            intro,
            {
                "type": "map_create_buttons",
                "value": {
                    "views": [{"name": map_name, "districtr_map_slug": map_slug}],
                    "type": "simple",
                },
            },
            form_block,
            # tags=[slug]: with no curated ids the gallery lists plans tagged
            # with the portal's own tag — submitted maps appear automatically.
            {"type": "plan_gallery", "value": {"ids": [], "tags": [slug]}},
        ]
    # testimony
    return [
        header,
        intro,
        form_block,
        {"type": "comment_gallery", "value": {"ids": [], "tags": [slug]}},
    ]


class PortalWizardForm(forms.Form):
    title = forms.CharField(max_length=255, help_text="The portal page's title.")
    slug = forms.SlugField(
        required=False,
        help_text="URL slug (also the portal's tag). Left blank, it is "
        "derived from the title.",
    )
    districtr_map_slug = forms.ChoiceField(label="Map module")
    template = forms.ChoiceField(
        choices=TEMPLATE_CHOICES,
        initial="testimony",
        widget=forms.RadioSelect,
        help_text="Starter page layout — every block can be changed in the "
        "page editor afterwards.",
    )
    fields = forms.MultipleChoiceField(
        choices=SUBMISSION_FIELD_CHOICES,
        widget=forms.CheckboxSelectMultiple,
        initial=DEFAULT_FIELDS,
        required=False,
        label="Form fields",
        help_text="Which fields the submission form shows.",
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
        help_text="Teams whose members moderate this portal's submissions.",
    )

    def __init__(self, *args, user, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = user
        scoped = user_is_team_scoped(user)
        self.fields["districtr_map_slug"].choices = [("", "---------")] + _map_choices(
            limit_to=districtr_map_slugs_for_user(user) if scoped else None
        )
        user_teams = team_slugs_for_user(user)
        if scoped:
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
            self.add_error(
                "slug", f"A form config for portal '{slug}' already exists."
            )

        extra = set(cleaned.get("required_fields") or []) - set(
            cleaned.get("fields") or []
        )
        if extra:
            self.add_error(
                "required_fields",
                f"Required fields must also be shown: {', '.join(sorted(extra))}",
            )
        return cleaned


def _tags_index():
    from content.models import TagsIndexPage

    return TagsIndexPage.objects.filter(locale=Locale.get_default()).first()


def portal_wizard(request):
    # Group gate applied at URL registration (content/wagtail_hooks.py) to
    # keep the PORTAL_EDITOR_GROUPS constant in one place.
    form = PortalWizardForm(request.POST or None, user=request.user)
    if request.method == "POST" and form.is_valid():
        from content.models import TagPage

        data = form.cleaned_data
        slug = data["slug"]
        map_labels = dict(form.fields["districtr_map_slug"].choices)
        body = _starter_body(
            data["template"],
            title=data["title"],
            slug=slug,
            map_slug=data["districtr_map_slug"],
            map_name=map_labels.get(
                data["districtr_map_slug"], data["districtr_map_slug"]
            ),
        )
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
                fields=data["fields"],
                required_fields=data["required_fields"],
                require_email_confirm=data["require_email_confirm"],
                admin_teams=data["admin_teams"],
            )
        messages.success(
            request,
            f"Portal '{data['title']}' created as a draft with its form "
            "config. Review the page and publish when ready.",
        )
        return redirect(reverse("wagtailadmin_pages:edit", args=[page.id]))

    return render(request, "content/portal_wizard.html", {"form": form})
