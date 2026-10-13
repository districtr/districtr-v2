"""
Provision the site scaffolding (final state, squashed 2026-08-06 from the
iterative first-pass migrations):

- a Locale row per configured content language (previously only created
  lazily by migrate_tiptap);
- the Tags / Places / Static index pages under the site home (shared
  content.provision helpers — real models, because the treebeard page tree
  cannot be manipulated through migration-state models; the index classes
  carry no fields beyond Page, so historical divergence is not a concern);
- Wagtail's stock "Welcome to your new Wagtail site!" home page renamed
  "Districtr" (the page itself is structural);
- the "Admin approval" Workflow: a single GroupApprovalTask for the admin
  group on the whole page tree, so partners (add_page only, no publish —
  authapi/0002) ship via "Submit for moderation". Same MTI-in-migration
  pattern as wagtailcore.0048_add_default_workflows; update_or_create on
  root because wagtailcore.0048 may already have attached its stock
  "Moderators approval" workflow there.

Reverse removes the workflow and restores the home title; locales and index
pages stay (deleting them would cascade to content created under them).
"""

from django.conf import settings
from django.db import migrations

WORKFLOW_NAME = "Admin approval"
STOCK_HOME_TITLE = "Welcome to your new Wagtail site!"
HOME_TITLE = "Districtr"


def create_locales(apps, schema_editor):
    Locale = apps.get_model("wagtailcore", "Locale")
    for language_code, _name in settings.WAGTAIL_CONTENT_LANGUAGES:
        Locale.objects.get_or_create(language_code=language_code)


def create_index_pages(apps, schema_editor):
    from content.provision import ensure_default_index_pages

    ensure_default_index_pages()


def rename_home(apps, schema_editor):
    Page = apps.get_model("wagtailcore", "Page")
    Page.objects.filter(depth=2, title=STOCK_HOME_TITLE).update(
        title=HOME_TITLE, draft_title=HOME_TITLE
    )


def restore_home(apps, schema_editor):
    Page = apps.get_model("wagtailcore", "Page")
    Page.objects.filter(depth=2, title=HOME_TITLE).update(
        title=STOCK_HOME_TITLE, draft_title=STOCK_HOME_TITLE
    )


def provision_workflow(apps, schema_editor):
    ContentType = apps.get_model("contenttypes", "ContentType")
    Group = apps.get_model("auth", "Group")
    Page = apps.get_model("wagtailcore", "Page")
    Workflow = apps.get_model("wagtailcore", "Workflow")
    GroupApprovalTask = apps.get_model("wagtailcore", "GroupApprovalTask")
    WorkflowTask = apps.get_model("wagtailcore", "WorkflowTask")
    WorkflowPage = apps.get_model("wagtailcore", "WorkflowPage")

    task_content_type, _ = ContentType.objects.get_or_create(
        app_label="wagtailcore", model="groupapprovaltask"
    )
    task, _ = GroupApprovalTask.objects.get_or_create(
        name=WORKFLOW_NAME,
        defaults={"content_type": task_content_type, "active": True},
    )
    task.groups.set([Group.objects.get(name="admin")])

    workflow, _ = Workflow.objects.get_or_create(
        name=WORKFLOW_NAME, defaults={"active": True}
    )
    WorkflowTask.objects.get_or_create(
        workflow=workflow, task_id=task.pk, defaults={"sort_order": 0}
    )
    WorkflowPage.objects.update_or_create(
        page=Page.objects.get(pk=1), defaults={"workflow": workflow}
    )


def remove_workflow(apps, schema_editor):
    Workflow = apps.get_model("wagtailcore", "Workflow")
    GroupApprovalTask = apps.get_model("wagtailcore", "GroupApprovalTask")
    Workflow.objects.filter(name=WORKFLOW_NAME).delete()
    GroupApprovalTask.objects.filter(name=WORKFLOW_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0001_initial"),
        ("authapi", "0002_provision_roles"),
        ("wagtailcore", "0002_initial_data"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunPython(create_locales, migrations.RunPython.noop),
        migrations.RunPython(create_index_pages, migrations.RunPython.noop),
        migrations.RunPython(rename_home, restore_home),
        migrations.RunPython(provision_workflow, remove_workflow),
    ]
