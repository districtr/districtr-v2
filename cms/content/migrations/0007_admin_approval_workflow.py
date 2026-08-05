"""
Provision the "Admin approval" workflow (feature list: admins review//approve).

Partners hold add_page / add+change gallery but no publish permissions
(authapi.0007), so their work ships via "Submit for moderation": a single
GroupApprovalTask for the admin group, wired to the whole page tree
(WorkflowPage on root) and to the Gallery snippet type (WorkflowContentType —
Gallery already mixes in WorkflowMixin). Same MTI-in-migration pattern as
wagtailcore.0048_add_default_workflows.
"""

from django.db import migrations

WORKFLOW_NAME = "Admin approval"


def provision_workflow(apps, schema_editor):
    ContentType = apps.get_model("contenttypes", "ContentType")
    Group = apps.get_model("auth", "Group")
    Page = apps.get_model("wagtailcore", "Page")
    Workflow = apps.get_model("wagtailcore", "Workflow")
    GroupApprovalTask = apps.get_model("wagtailcore", "GroupApprovalTask")
    WorkflowTask = apps.get_model("wagtailcore", "WorkflowTask")
    WorkflowPage = apps.get_model("wagtailcore", "WorkflowPage")
    WorkflowContentType = apps.get_model("wagtailcore", "WorkflowContentType")

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

    # Whole page tree (root always exists: wagtailcore.0002_initial_data).
    # update_or_create: wagtailcore.0048 may already have attached its stock
    # "Moderators approval" workflow to root — ours replaces it.
    WorkflowPage.objects.update_or_create(
        page=Page.objects.get(pk=1), defaults={"workflow": workflow}
    )
    # Gallery snippets.
    gallery_content_type, _ = ContentType.objects.get_or_create(
        app_label="galleries", model="gallery"
    )
    WorkflowContentType.objects.update_or_create(
        content_type=gallery_content_type, defaults={"workflow": workflow}
    )


def remove_workflow(apps, schema_editor):
    Workflow = apps.get_model("wagtailcore", "Workflow")
    GroupApprovalTask = apps.get_model("wagtailcore", "GroupApprovalTask")
    Workflow.objects.filter(name=WORKFLOW_NAME).delete()
    GroupApprovalTask.objects.filter(name=WORKFLOW_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0006_provision_locales"),
        ("authapi", "0007_consolidate_partner_groups"),
        ("galleries", "0001_initial"),
        ("wagtailcore", "0083_workflowcontenttype"),
    ]

    operations = [
        migrations.RunPython(provision_workflow, remove_workflow),
    ]
