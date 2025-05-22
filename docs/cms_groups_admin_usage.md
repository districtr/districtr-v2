# CMS Groups Admin Usage Guide

This document explains how to use the new Groups content type in the Districtr CMS admin interface.

## Accessing the Groups CMS

1. Navigate to the CMS admin dashboard at `/admin/cms`
2. Click on the "Go to Groups" button in the Groups card
3. You'll be taken to the Groups CMS editor at `/admin/cms/groups`

## Creating Group Content

1. In the editor form at the top of the page, fill in the required fields:
   - **Title**: The title of the group page
   - **Slug**: The URL path for the group (e.g., "midwest-states")
   - **Language**: Select the language for this content
   - **Groups**: Select one or more groups from the dropdown menu
   - **Body Content**: Add rich text content for the group page

2. The rich text editor provides several tools to format your content:
   - Text formatting (bold, italic, underline)
   - Headings
   - Lists
   - Links and images
   - Special components:
     - **Data Explainer**: Add explanatory content about data
     - **Group Gallery**: Add a visual gallery of maps in selected groups

3. Click "Create Content" to save your new group page

## Using the Group Gallery Component

The Group Gallery component is a powerful feature that allows you to embed a curated collection of maps from specific groups:

1. Click the "Insert Group Gallery" button in the rich text editor toolbar (grid icon)
2. In the dialog that appears, select the groups you want to include
3. Add any custom text or content to appear above the gallery
4. Click "Save" to insert the component

The Group Gallery will dynamically display all maps associated with the selected groups, including their thumbnails and "Create" buttons.

## Editing Group Content

1. Find the group content you want to edit in the list at the bottom of the page
2. Click "Edit" to load it into the editor
3. Make your changes to any field
4. Click "Update Content" to save your changes

## Publishing Group Content

1. After creating or editing group content, it is saved as a draft
2. To make it publicly visible, click "Publish" in the content list
3. This will copy your draft content to the published version

## Deleting Group Content

1. Find the group content you want to delete in the list
2. Click "Delete"
3. Confirm the deletion when prompted

## Preview and Test

1. Use the "Preview" button to see how your content will appear
2. After publishing, visit the group page at `/group/[slug]` to view it live

## Best Practices

1. Use descriptive titles that clearly identify the purpose of the group
2. Include helpful explanatory text before map galleries
3. Group related maps together for better organization
4. Use rich text formatting to create clear section headings and structure