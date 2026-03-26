# Scoped User Tags & Places Permissions Plan

## Current State

The Tags and Places collections use role-based access control:
- **Admin**: full CRUD on all content
- **Editor**: create, read, update, delete their own content
- **Reviewer**: read-only

There is no concept of scoping a user to specific tags or places. An editor can edit any tag or place they have access to.

## Goal

Allow admins to assign specific tags and/or places to users, so editors can only create and edit content within their assigned scope. For example, an editor assigned to "Cook County" can only edit tags and places related to Cook County.

## Approach: User-Level Scope Fields + Access Control Functions

### Implementation Steps

1. **Add scope fields to the Users collection** (`collections/Users.ts`)
   ```ts
   {
     name: 'assignedTags',
     type: 'relationship',
     relationTo: 'tags',
     hasMany: true,
     admin: {
       description: 'Tags this user can edit. Leave empty for unrestricted access.',
       condition: (data) => data.role === 'editor',
     },
   },
   {
     name: 'assignedPlaces',
     type: 'relationship',
     relationTo: 'places',
     hasMany: true,
     admin: {
       description: 'Places this user can edit. Leave empty for unrestricted access.',
       condition: (data) => data.role === 'editor',
     },
   },
   ```

2. **Update collection access control** (`collections/Tags.ts`, `Places.ts`)
   ```ts
   access: {
     read: () => true,
     create: ({ req }) => {
       if (req.user?.role === 'admin') return true;
       if (req.user?.role === 'editor') {
         // Editors can create if they have any assignments (or no restriction)
         return !req.user?.assignedTags?.length || true;
       }
       return false;
     },
     update: ({ req }) => {
       if (req.user?.role === 'admin') return true;
       if (req.user?.role === 'editor') {
         // If user has assigned tags, restrict to those IDs
         if (req.user?.assignedTags?.length) {
           return { id: { in: req.user.assignedTags.map(t => t.id || t) } };
         }
         return true; // No restriction if no assignments
       }
       return false;
     },
     delete: ({ req }) => req.user?.role === 'admin',
   }
   ```

3. **Add `saveToJWT` on scope fields** so the Python backend can also enforce scoping
   ```ts
   {
     name: 'assignedTags',
     saveToJWT: true,
     // ...
   }
   ```

4. **Admin list view filtering**
   - Use Payload's `admin.baseListFilter` on Tags/Places collections to automatically filter the list view to show only the user's assigned content
   ```ts
   admin: {
     baseListFilter: ({ req }) => {
       if (req.user?.role === 'admin') return {};
       if (req.user?.assignedTags?.length) {
         return { id: { in: req.user.assignedTags } };
       }
       return {};
     },
   }
   ```

5. **Update Python backend** (`security.py`)
   - Extract `assignedTags` and `assignedPlaces` from the Payload JWT
   - Add to the decoded payload dict for use by endpoint guards
   - Comment review endpoints can optionally filter by the user's assigned scope

### Key Files
- `app/src/collections/Users.ts` — add assignedTags/assignedPlaces relationship fields
- `app/src/collections/Tags.ts`, `Places.ts` — update access control with scope filtering
- `backend/app/core/security.py` — extract scope claims from JWT

### Considerations
- Admins always bypass scoping
- Editors with no assignments have unrestricted access (backward compatible)
- The `assignedTags` field uses a `relationship` type so it references actual Tag documents
- Deleting a Tag that's in someone's scope should be handled gracefully (Payload handles this with `onDelete` hooks)

### Effort Estimate
2-3 days
