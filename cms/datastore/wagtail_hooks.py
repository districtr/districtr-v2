"""
Wagtail admin registration for the datastore mirrors.

Everything is grouped under a single "Data" menu item (database icon) via a
SnippetViewSetGroup. Snippets respect Django model permissions: the `admin`
group is granted all datastore permissions by the authapi/0002_provision_roles data migration and
`super_partner` gets the map-module/overlay subset by authapi/0002_provision_roles; partners
get none, so the menu simply does not appear for them.

FK widgets: because the target models are registered as snippets, ForeignKeys
to them automatically render as snippet choosers (search + pagination, 10 per
page) rather than unbounded <select> dropdowns. The exception is
DistrictrMap.parent_layer/child_layer, which reference GerryDBTable.name
(a non-pk to_field) — Wagtail's chooser resolves values by pk, so those two
panels force a plain Django select instead.

The DistrictrMap edit page is the single place to manage a map module: the
mapped fields plus three inline-formset sections (attached overlays, map-group
listings, team assignments) and a "Regenerate thumbnail" button. The link
tables (DistrictrMapOverlays, DistrictrMapsToGroups, authapi.TeamDistrictrMap)
have no snippet listings of their own. Plain Django inline formsets are used
because the mirrors are managed=False models — ParentalKey/InlinePanel is not
available on them.
"""

from functools import cached_property

from django import forms
from django.db import ProgrammingError, connection, transaction
from django.forms.models import inlineformset_factory
from django.shortcuts import redirect
from django.urls import path, reverse
from wagtail import hooks
from wagtail.admin import messages
from wagtail.admin.forms.models import WagtailAdminModelForm
from wagtail.admin.menu import MenuItem
from wagtail.admin.panels import FieldPanel, MultiFieldPanel, ObjectList
from wagtail.permission_policies.base import ModelPermissionPolicy
from wagtail.snippets.models import register_snippet
from wagtail.snippets.views.snippets import (
    DeleteView,
    EditView,
    HistoryView,
    InspectView,
    SnippetViewSet,
    SnippetViewSetGroup,
    UsageView,
)

from authapi.models import Team, TeamDistrictrMap
from django.http import Http404

from authapi.teams import (
    TeamScopedGetObjectMixin,
    TeamScopedViewGrantPermissionPolicy,
    TeamScopedViewSetMixin,
    team_slugs_for_user,
    user_is_unscoped_admin,
)
from datastore import views
from datastore.models import (
    COLLECTION_MODE_CHOICES,
    SUBMISSION_FIELD_CHOICES,
    DistrictrMap,
    DistrictrMapOverlays,
    DistrictrMapsToGroups,
    FormConfig,
    FormFieldCustom,
    Overlay,
)
from datastore.views import (
    DATASTORE_ADMIN_PERMISSION,
    OVERLAY_ADMIN_PERMISSION,
)

# DistrictrMap reaches its Teams through the TeamDistrictrMap link table
# (authapi, related_name "team_links").
DISTRICTRMAP_TEAM_FIELD = "team_links__team_id"


@hooks.register("register_icons")
def register_icons(icons):
    return icons + ["datastore/icons/database.svg"]


class _MapScoped(TeamScopedGetObjectMixin):
    """404 out-of-scope Districtr maps on the object views that fetch straight
    from the model (inspect/history/usage) — the index get_queryset filter
    alone wouldn't stop a guessed UUID."""

    team_filter_field = DISTRICTRMAP_TEAM_FIELD


class TeamScopedMapInspectView(_MapScoped, InspectView):
    pass


class TeamScopedMapHistoryView(_MapScoped, HistoryView):
    pass


class TeamScopedMapUsageView(_MapScoped, UsageView):
    pass


def _name_ordered_formfield(db_field, **kwargs):
    """Order the link-table FK dropdowns by target name (the mirrors have no
    Meta.ordering); overlays additionally by layer type, so the line/text
    overlays of one data source sit adjacent."""
    formfield = db_field.formfield(**kwargs)
    if hasattr(formfield, "queryset"):
        if db_field.related_model is Overlay:
            formfield.queryset = formfield.queryset.order_by("name", "layer_type")
        else:
            formfield.queryset = formfield.queryset.order_by("name")
    return formfield


# The three link tables managed from the DistrictrMap edit page. The mirrors
# are managed=False plain models, so these are plain Django inline formsets
# (no ParentalKey/InlinePanel); one blank extra row per save adds one link.
OverlayLinkFormSet = inlineformset_factory(
    DistrictrMap,
    DistrictrMapOverlays,
    fk_name="districtr_map",
    fields=["overlay"],
    extra=1,
    can_delete=True,
    formfield_callback=_name_ordered_formfield,
)
GroupLinkFormSet = inlineformset_factory(
    DistrictrMap,
    DistrictrMapsToGroups,
    fk_name="districtrmap",
    fields=["group"],
    extra=1,
    can_delete=True,
    formfield_callback=_name_ordered_formfield,
)
TeamLinkFormSet = inlineformset_factory(
    DistrictrMap,
    TeamDistrictrMap,
    fk_name="districtr_map",
    fields=["team"],
    extra=1,
    can_delete=True,
    formfield_callback=_name_ordered_formfield,
)


class DistrictrMapEditView(EditView):
    """The map edit form plus the module's relational sections.

    Overlays and map-group listings are editable by whoever may change the
    map (admin + super_partner — the view's own "change" permission gate).
    Team assignments are admin-only (Teams are admin-managed), so that
    formset is only built — and its POST data only honoured — for users
    holding authapi Team permissions.
    """

    def user_may_assign_teams(self):
        return self.request.user.has_perm("authapi.change_team")

    def get_link_formsets(self, data=None):
        formsets = {
            "overlays_formset": OverlayLinkFormSet(
                data, instance=self.object, prefix="overlay_links"
            ),
            "groups_formset": GroupLinkFormSet(
                data, instance=self.object, prefix="group_links"
            ),
        }
        if self.user_may_assign_teams():
            formsets["teams_formset"] = TeamLinkFormSet(
                data, instance=self.object, prefix="team_links"
            )
        return formsets

    def form_valid(self, form):
        self.link_formsets = self.get_link_formsets(self.request.POST)
        if not all(formset.is_valid() for formset in self.link_formsets.values()):
            self.form = form
            messages.error(self.request, self.get_error_message())
            return self.render_to_response(self.get_context_data(form=form))
        return super().form_valid(form)

    def form_invalid(self, form):
        # Bind the formsets so user input survives the error re-render.
        self.link_formsets = self.get_link_formsets(self.request.POST)
        return super().form_invalid(form)

    def save_instance(self):
        # Called inside form_valid's transaction.atomic() — the map row and
        # its link rows commit or roll back together.
        instance = super().save_instance()
        for formset in self.link_formsets.values():
            formset.save()
        return instance

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        if not hasattr(self, "link_formsets"):
            self.link_formsets = self.get_link_formsets()
        context.update(self.link_formsets)
        if self.request.user.has_perm(DATASTORE_ADMIN_PERMISSION):
            context["regenerate_thumbnail_url"] = reverse(
                "datastore_map_regenerate_thumbnail", args=[self.object.pk]
            )
        return context


class DistrictrMapViewSet(TeamScopedViewSetMixin, SnippetViewSet):
    model = DistrictrMap
    icon = "globe"
    menu_label = "Edit map modules"
    list_display = [
        "name",
        "districtr_map_slug",
        "num_districts",
        "map_type",
        "visible",
    ]
    list_filter = ["visible", "map_type"]
    search_fields = ["name", "districtr_map_slug"]
    list_per_page = 50
    inspect_view_enabled = True
    inspect_view_class = TeamScopedMapInspectView
    history_view_class = TeamScopedMapHistoryView
    usage_view_class = TeamScopedMapUsageView
    edit_view_class = DistrictrMapEditView

    # Team-scoped members may browse (view/inspect) only the Districtr maps
    # assigned to their teams; admins keep full edit access (authapi/teams.py).
    team_filter_field = DISTRICTRMAP_TEAM_FIELD
    permission_policy_class = TeamScopedViewGrantPermissionPolicy

    # created_at/updated_at are auto-managed (auto_now_add/auto_now) and thus
    # not editable; every other mapped field is on the form.
    edit_handler = ObjectList(
        [
            MultiFieldPanel(
                [
                    FieldPanel("uuid", read_only=True),
                    FieldPanel("name"),
                    FieldPanel("districtr_map_slug"),
                    FieldPanel("map_type"),
                    FieldPanel("data_source_name"),
                    FieldPanel("statefps"),
                ],
                heading="Identity",
            ),
            MultiFieldPanel(
                [
                    FieldPanel("gerrydb_table_name"),
                    FieldPanel("parent_layer", widget=forms.Select),
                    FieldPanel("child_layer", widget=forms.Select),
                    FieldPanel("parent_geo_unit_type"),
                    FieldPanel("child_geo_unit_type"),
                ],
                heading="Layers",
            ),
            MultiFieldPanel(
                [
                    FieldPanel("num_districts"),
                    FieldPanel("num_districts_modifiable"),
                ],
                heading="Districts",
            ),
            MultiFieldPanel(
                [
                    FieldPanel("tiles_s3_path"),
                    FieldPanel("extent"),
                ],
                heading="Tiles",
            ),
            MultiFieldPanel(
                [
                    FieldPanel("visible"),
                    FieldPanel("comment"),
                    FieldPanel("comment_length_limit"),
                    FieldPanel("comment_count_limit"),
                ],
                heading="Moderation",
            ),
        ]
    )


class OverlayViewSet(SnippetViewSet):
    model = Overlay
    icon = "sliders"
    menu_label = "Edit overlays"
    list_display = ["name", "layer_type", "data_type", "source"]
    list_filter = ["data_type", "layer_type"]
    search_fields = ["name", "description"]
    ordering = ["name", "layer_type"]
    list_per_page = 50
    panels = [
        FieldPanel("overlay_id", read_only=True),
        FieldPanel("name"),
        FieldPanel("description"),
        FieldPanel("data_type"),
        FieldPanel("layer_type"),
        FieldPanel("custom_style", widget=forms.Textarea),
        FieldPanel("source"),
        FieldPanel("source_layer"),
        FieldPanel("id_property"),
    ]


class DataToolMenuItem(MenuItem):
    """Submenu entry for the data-ops tool pages (import, overlays, compose,
    thumbnails).

    Mirrors the snippet permission gate: only users who may add datastore
    rows (the admin group) see — or may use — the tools. Each tool view
    enforces the same permission server-side.
    """

    def __init__(self, *args, permission=DATASTORE_ADMIN_PERMISSION, **kwargs):
        self.permission = permission
        super().__init__(*args, **kwargs)

    def is_shown(self, request):
        return request.user.has_perm(self.permission)


class DataViewSetGroup(SnippetViewSetGroup):
    """Action-oriented "Map modules" menu: Create map module (one-page compose
    with overlays + team assignment), Edit map modules / Edit overlays
    (listings), Upload overlay."""

    menu_label = "Map modules"
    menu_icon = "database"
    menu_order = 200
    items = (
        DistrictrMapViewSet,
        OverlayViewSet,
    )

    def get_submenu_items(self):
        listings = super().get_submenu_items()
        for offset, item in enumerate(listings):
            item.order = 10 + offset
        return [
            DataToolMenuItem(
                "Create map module",
                reverse("datastore_compose_map"),
                icon_name="plus",
                order=1,
            ),
            *listings,
            DataToolMenuItem(
                "Upload overlay",
                reverse("datastore_upload_overlay"),
                icon_name="upload",
                order=20,
                permission=OVERLAY_ADMIN_PERMISSION,
            ),
        ]


register_snippet(DataViewSetGroup)


def _map_slugs_with_documents(slugs):
    """Saved-plan counts per map slug, read straight from the shared database.

    document.document is deliberately not mirrored (datastore/models.py), so
    this is a raw read. Purely UX: its FK to districtrmap has NO ACTION, so
    the database still hard-blocks such deletes if this check misses.
    """
    if not slugs:
        return {}
    try:
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute(
                "SELECT districtr_map_slug, count(*) FROM document.document "
                "WHERE districtr_map_slug = ANY(%s) GROUP BY districtr_map_slug",
                [list(slugs)],
            )
            return dict(cursor.fetchall())
    except ProgrammingError:
        # Table absent (cms-only database): let the FK decide.
        return {}


def _deny_map_delete_with_documents(request, maps):
    counts = _map_slugs_with_documents([m.districtr_map_slug for m in maps])
    if not counts:
        return None
    summary = ", ".join(
        f"{slug} ({count} plan{'s' if count != 1 else ''})"
        for slug, count in sorted(counts.items())
    )
    messages.error(
        request,
        f"Cannot delete maps that have saved plans: {summary}. "
        "Hide a retired map by unsetting its visible flag instead.",
    )
    return redirect("wagtailsnippets_datastore_districtrmap:list")


@hooks.register("before_delete_snippet")
def deny_districtrmap_delete_with_documents(request, instances):
    maps = [obj for obj in instances if isinstance(obj, DistrictrMap)]
    if maps:
        return _deny_map_delete_with_documents(request, maps)


@hooks.register("before_bulk_action")
def deny_districtrmap_bulk_delete_with_documents(request, action_type, objects, action):
    if action_type != "delete":
        return None
    maps = [obj for obj in objects if isinstance(obj, DistrictrMap)]
    if maps:
        return _deny_map_delete_with_documents(request, maps)


@hooks.register("register_admin_urls")
def register_datastore_admin_urls():
    # Mounted under /admin/ and wrapped in require_admin_access by Wagtail;
    # the views additionally require their datastore add permission.
    return [
        path(
            "data/upload-overlay/",
            views.upload_overlay,
            name="datastore_upload_overlay",
        ),
        path("data/compose-map/", views.compose_map, name="datastore_compose_map"),
        path(
            "data/maps/<uuid:pk>/regenerate-thumbnail/",
            views.regenerate_map_thumbnail,
            name="datastore_map_regenerate_thumbnail",
        ),
    ]


# ---------------------------------------------------------------------------
# Portal forms (FormConfig — the comments.form_configs mirror)
# ---------------------------------------------------------------------------


class FormConfigAdminForm(WagtailAdminModelForm):
    """Checkbox multi-selects over the fixed field registry and team slugs —
    the ArrayFields' default comma-separated text inputs invite typos the
    backend would then reject at submission time."""

    collection_mode = forms.ChoiceField(
        choices=COLLECTION_MODE_CHOICES,
        widget=forms.RadioSelect,
        initial="prompt",
        label="How are map submissions collected?",
    )

    fields = forms.MultipleChoiceField(
        choices=SUBMISSION_FIELD_CHOICES,
        widget=forms.CheckboxSelectMultiple,
        required=False,
        help_text="Which fields the portal's submission form shows.",
    )
    required_fields = forms.MultipleChoiceField(
        choices=SUBMISSION_FIELD_CHOICES,
        widget=forms.CheckboxSelectMultiple,
        required=False,
        help_text="Must be a subset of the fields above.",
    )
    admin_teams = forms.MultipleChoiceField(
        widget=forms.CheckboxSelectMultiple,
        required=False,
        help_text="Teams whose members moderate this portal's submissions.",
    )

    class Meta:
        model = FormConfig
        fields = [
            "portal_id",
            "name",
            "collection_mode",
            "fields",
            "required_fields",
            "require_email_confirm",
            "admin_teams",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Restricted (non-admin) editors may only grant/revoke moderation for
        # their OWN teams — offering every team let them hand another team
        # read access to submitters' private fields, or drop their own team
        # and lock themselves out. Same rule the wizard applies.
        user = self.for_user
        if user is not None and not user_is_unscoped_admin(user):
            teams = Team.objects.filter(slug__in=team_slugs_for_user(user))
        else:
            teams = Team.objects.all()
        self.fields["admin_teams"].choices = [
            (team.slug, team.name) for team in teams.order_by("name")
        ]

    def clean_portal_id(self):
        portal_id = self.cleaned_data["portal_id"]
        # portal_id is the join key to the TagPage AND the backend FK target
        # (ON UPDATE CASCADE drags comments.submissions.portal_id along), so
        # renames silently re-home submissions and detach the live page.
        # Only unscoped admins may change it, and only to a real portal slug.
        if (
            self.instance.pk
            and portal_id != self.instance.portal_id
            and self.for_user is not None
            and not user_is_unscoped_admin(self.for_user)
        ):
            raise forms.ValidationError(
                "Only admins may re-point a form at a different portal."
            )
        from wagtail.models import Locale

        from content.models import TagPage

        if not TagPage.objects.filter(
            locale=Locale.get_default(), slug=portal_id
        ).exists():
            raise forms.ValidationError(
                f"No portal page with slug '{portal_id}' exists."
            )
        return portal_id

    def clean(self):
        cleaned = super().clean()
        extra = set(cleaned.get("required_fields") or []) - set(
            cleaned.get("fields") or []
        )
        if extra:
            self.add_error(
                "required_fields",
                f"Required fields must also be shown: {', '.join(sorted(extra))}",
            )
        user = self.for_user
        if user is not None and not user_is_unscoped_admin(user):
            chosen = set(cleaned.get("admin_teams") or [])
            if not chosen & set(team_slugs_for_user(user)):
                self.add_error(
                    "admin_teams",
                    "At least one of your own teams must keep moderation "
                    "access (otherwise you lose this form).",
                )
        return cleaned


class FormConfigPermissionPolicy(ModelPermissionPolicy):
    """Model permissions, narrowed for team-scoped users to configs whose
    admin_teams intersect their team slugs (the same rule the backend
    enforces on the moderation endpoints)."""

    def instances_user_has_permission_for(self, user, action):
        instances = super().instances_user_has_permission_for(user, action)
        if not user_is_unscoped_admin(user):
            # NOT user_is_team_scoped: a partner with no team must see
            # nothing (overlap with [] is empty), not inherit admin reach —
            # the backend fails the same user closed (teams: [] -> 403).
            return instances.filter(admin_teams__overlap=team_slugs_for_user(user))
        return instances

    def user_has_permission_for_instance(self, user, action, instance):
        if not super().user_has_permission_for_instance(user, action, instance):
            return False
        if not user_is_unscoped_admin(user):
            return bool(set(instance.admin_teams) & set(team_slugs_for_user(user)))
        return True


class _FormConfigScoped:
    """404 out-of-scope configs on the object views — the index queryset
    filter alone wouldn't stop a guessed pk, and the snippet Edit/Delete
    views fetch straight from the model. Same idea as _MapScoped, keyed on
    admin_teams overlap."""

    def get_object(self, *args, **kwargs):
        obj = super().get_object(*args, **kwargs)
        user = self.request.user
        if not user_is_unscoped_admin(user) and not (
            set(obj.admin_teams) & set(team_slugs_for_user(user))
        ):
            raise Http404
        return obj


class FormConfigDeleteView(_FormConfigScoped, DeleteView):
    pass


class FormConfigHistoryView(_FormConfigScoped, HistoryView):
    pass


class FormConfigUsageView(_FormConfigScoped, UsageView):
    pass


class CustomFieldInlineFormSet(forms.BaseInlineFormSet):
    """The portal's custom questions: keys are derived from labels
    ('custom_' + slug) when blank, and must stay unique per portal."""

    def clean(self):
        super().clean()
        seen = set()
        for form in self.forms:
            if not form.cleaned_data or form.cleaned_data.get("DELETE"):
                continue
            instance = form.instance
            if not instance.key:
                from django.utils.text import slugify as dj_slugify

                slug = dj_slugify(form.cleaned_data.get("label", "")).replace("-", "_")
                instance.key = f"custom_{slug}"[:64]
            if instance.key in seen:
                form.add_error(
                    "label",
                    "Two custom questions would share the key "
                    f"'{instance.key}' — make the labels distinct.",
                )
            seen.add(instance.key)


CustomFieldFormSet = forms.inlineformset_factory(
    FormConfig,
    FormFieldCustom,
    formset=CustomFieldInlineFormSet,
    fields=["label", "field_type", "required", "sort_order"],
    extra=2,
    can_delete=True,
)


class FormConfigEditView(_FormConfigScoped, EditView):
    """FormConfig edit form plus the custom-questions formset — the same
    link-formset pattern as DistrictrMapEditView above; the config row and
    its question rows commit or roll back together. Out-of-scope configs
    404 via _FormConfigScoped."""

    def get_link_formsets(self, data=None):
        return {
            "custom_fields_formset": CustomFieldFormSet(
                data, instance=self.object, prefix="custom_fields"
            )
        }

    def form_valid(self, form):
        self.link_formsets = self.get_link_formsets(self.request.POST)
        if not all(formset.is_valid() for formset in self.link_formsets.values()):
            self.form = form
            messages.error(self.request, self.get_error_message())
            return self.render_to_response(self.get_context_data(form=form))
        return super().form_valid(form)

    def form_invalid(self, form):
        self.link_formsets = self.get_link_formsets(self.request.POST)
        return super().form_invalid(form)

    def save_instance(self):
        instance = super().save_instance()
        for formset in self.link_formsets.values():
            formset.save()
        return instance

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        if not hasattr(self, "link_formsets"):
            self.link_formsets = self.get_link_formsets()
        context.update(self.link_formsets)
        return context


class FormConfigViewSet(SnippetViewSet):
    model = FormConfig
    icon = "form"
    menu_label = "Portal forms"
    list_display = ["name", "portal_id", "collection_mode", "admin_teams"]
    search_fields = ["name", "portal_id"]
    list_per_page = 50
    edit_view_class = FormConfigEditView
    delete_view_class = FormConfigDeleteView
    history_view_class = FormConfigHistoryView
    usage_view_class = FormConfigUsageView
    edit_handler = ObjectList(
        [
            FieldPanel(
                "portal_id",
                help_text="Must equal the portal page's slug — the wizard "
                "sets this; admins only, and only when renaming the page "
                "slug too (the rename cascades to existing submissions).",
            ),
            FieldPanel("name"),
            FieldPanel("collection_mode"),
            FieldPanel("fields"),
            FieldPanel("required_fields"),
            FieldPanel("require_email_confirm"),
            FieldPanel("admin_teams"),
        ],
        base_form_class=FormConfigAdminForm,
    )

    def get_queryset(self, request):
        if not user_is_unscoped_admin(request.user):
            return FormConfig.objects.filter(
                admin_teams__overlap=team_slugs_for_user(request.user)
            )
        return None

    @cached_property
    def permission_policy(self):
        return FormConfigPermissionPolicy(self.model)


register_snippet(FormConfigViewSet)


def _portals_with_submissions(portal_ids):
    """Submission counts per portal, read straight from the shared database.

    comments.submissions is not mirrored; purely UX — the backend FK is
    ON DELETE RESTRICT, so the database hard-blocks these deletes anyway.
    """
    if not portal_ids:
        return {}
    try:
        # atomic(): a ProgrammingError from a missing comments schema must
        # not leave the surrounding transaction aborted (the caller still
        # writes messages/redirects afterwards).
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute(
                "SELECT portal_id, count(*) FROM comments.submissions "
                "WHERE portal_id = ANY(%s) GROUP BY portal_id",
                [list(portal_ids)],
            )
            return dict(cursor.fetchall())
    except ProgrammingError:
        return {}


def _deny_form_config_delete_with_submissions(request, configs):
    counts = _portals_with_submissions([c.portal_id for c in configs])
    if not counts:
        return None
    summary = ", ".join(
        f"{portal} ({count} submission{'s' if count != 1 else ''})"
        for portal, count in sorted(counts.items())
    )
    messages.error(
        request,
        f"Cannot delete portal forms that have submissions: {summary}.",
    )
    return redirect("wagtailsnippets_datastore_formconfig:list")


@hooks.register("before_delete_snippet")
def deny_form_config_delete_with_submissions(request, instances):
    configs = [obj for obj in instances if isinstance(obj, FormConfig)]
    if configs:
        return _deny_form_config_delete_with_submissions(request, configs)


@hooks.register("before_bulk_action")
def deny_form_config_bulk_delete_with_submissions(
    request, action_type, objects, action
):
    if action_type != "delete":
        return None
    configs = [obj for obj in objects if isinstance(obj, FormConfig)]
    if configs:
        return _deny_form_config_delete_with_submissions(request, configs)
