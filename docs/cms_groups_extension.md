# CMS Groups Extension

This document outlines the changes made to extend the CMS schema to include "groups" and to refactor the group icons layout.

## Backend Changes

### 1. New CMS Model

A new `GroupsCMSContent` model has been added to `/backend/app/cms/models.py` that includes:
- Standard CMS fields (id, slug, language, draft/published content)
- A `group_slugs` field to store references to map groups from the `public.map_group` table

### 2. Alembic Migration

A new migration (`b72e5f198a64_add_groups_to_cms.py`) has been created to:
- Create the `groups_content` table in the CMS schema
- Add the necessary columns and constraints

## Frontend Changes

### 1. Rich Text Editor Extensions

New components have been created to support embedding group galleries in rich text content:

- `GroupNode.ts`: Defines the Tiptap node extension for group galleries
- `GroupNodeView.tsx`: The editor view that allows selecting groups and adding custom content
- `GroupNodeRenderer.tsx`: Renders the selected groups and their maps in the frontend
- `GroupContent.tsx`: Provides default content for the group component

### 2. Integration with Existing Components

The following files have been updated to integrate the new group component:

- `DomNodeRenderers.tsx`: Updated to recognize and render the group node
- `useCmsEditorConfig.tsx`: 
  - Added the GroupNode extension
  - Added a new button to insert group galleries in the editor toolbar

### 3. Example Group Page

An example implementation is provided in `app/(static)/group/[slug]/page.tsx.example` that shows how to:
- Fetch both group data and CMS content 
- Render rich text content when available
- Fall back to the default grid view when no CMS content exists

## Usage

1. **Creating Group Content**:
   - Go to the CMS editor
   - Create a new content with type "groups"
   - Use the "Insert Group Gallery" button to add a group component
   - Select the groups to display and add custom content

2. **Rendering Group Content**:
   - The group component will automatically display the selected groups with their maps
   - Custom content will appear above the group gallery
   - The layout is responsive and will adjust to different screen sizes

## Notes

- The group selection UI in the editor will fetch available groups from the `map_group` table
- When no groups are selected, a message will be displayed
- For backwards compatibility, pages will fall back to the original grid layout if no CMS content exists