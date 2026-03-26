# Draft Approval Pipeline Plan

## Current State

Payload's built-in versioning is enabled on Tags and Places (`versions: { drafts: true }`). This gives us draft/published states, but any user with update access can publish directly. There's no review step between drafting and publishing.

## Goal

Implement a content workflow where:
1. Editors create and edit drafts
2. Editors submit drafts for review
3. Admins review and approve/reject submissions
4. Only approved content gets published
5. Changes to already-published content also require approval

## Approach: Custom Workflow Status Field + Hooks

Payload doesn't have built-in approval workflows, but we can build one with a status field, access control, and hooks.

### Implementation Steps

1. **Add workflow status field** to Tags and Places collections
   ```ts
   {
     name: 'workflowStatus',
     type: 'select',
     defaultValue: 'draft',
     options: [
       { label: 'Draft', value: 'draft' },
       { label: 'Pending Review', value: 'pending_review' },
       { label: 'Approved', value: 'approved' },
       { label: 'Changes Requested', value: 'changes_requested' },
     ],
     admin: {
       position: 'sidebar',
       readOnly: true, // Only changed via workflow actions
     },
     access: {
       update: ({ req }) => req.user?.role === 'admin',
     },
   }
   ```

2. **Add reviewer notes field**
   ```ts
   {
     name: 'reviewNotes',
     type: 'textarea',
     admin: {
       position: 'sidebar',
       description: 'Notes from the reviewer about requested changes',
       condition: (data) => data.workflowStatus === 'changes_requested',
     },
   }
   ```

3. **Restrict publishing to admins only**
   - Use Payload's `access.readVersions` and custom logic in the `beforeChange` hook
   ```ts
   hooks: {
     beforeChange: [
       ({ data, req, operation }) => {
         // Only admins can set _status to 'published'
         if (data._status === 'published' && req.user?.role !== 'admin') {
           throw new APIError('Only admins can publish content', 403);
         }
         // Auto-set workflowStatus when publishing
         if (data._status === 'published') {
           data.workflowStatus = 'approved';
         }
         return data;
       },
     ],
   }
   ```

4. **Add "Submit for Review" action** as a custom Payload admin component
   - A button in the sidebar that sets `workflowStatus` to `pending_review`
   - Available only to editors when the current status is `draft` or `changes_requested`
   - Calls `payload.update()` with the new status

5. **Add "Approve" / "Request Changes" actions** for admins
   - Admin sidebar component with Approve and Request Changes buttons
   - Approve: sets `workflowStatus` to `approved` and publishes (`_status: 'published'`)
   - Request Changes: sets `workflowStatus` to `changes_requested` with notes

6. **Admin dashboard view** for pending reviews
   - Custom Payload view listing all content with `workflowStatus: 'pending_review'`
   - Shows title, type (tag/place), submitted by, submitted date
   - Links directly to the edit page for review

7. **Email notifications** (optional, phase 2)
   - Use Payload's `afterChange` hook to send email when:
     - Content is submitted for review → notify admins
     - Content is approved or changes requested → notify the author
   - Use Payload's email adapter or a simple SMTP integration

### Admin UI Workflow

```
Editor creates/edits content
  → Saves as draft (workflowStatus: 'draft')
  → Clicks "Submit for Review" (workflowStatus: 'pending_review')

Admin sees pending review in dashboard
  → Opens content, reviews changes
  → Clicks "Approve" → content published (workflowStatus: 'approved', _status: 'published')
  → OR clicks "Request Changes" + adds notes (workflowStatus: 'changes_requested')

Editor sees "Changes Requested" with notes
  → Makes changes, re-submits for review
```

### Key Files
- `app/src/collections/Tags.ts`, `Places.ts` — add workflowStatus field, hooks, access control
- New: `app/src/app/components/PayloadViews/PendingReviewsView.tsx` — admin dashboard
- New: `app/src/app/components/PayloadAdmin/WorkflowSidebar.tsx` — submit/approve/reject buttons
- `app/src/payload.config.ts` — register new admin view

### Effort Estimate
3-5 days
