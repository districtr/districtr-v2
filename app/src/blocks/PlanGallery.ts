import type {Block} from 'payload';

export const PlanGallery: Block = {
  slug: 'planGallery',
  labels: {
    singular: 'Plan Gallery',
    plural: 'Plan Galleries',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Gallery Title',
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Description',
    },
    {
      type: 'row',
      fields: [
        {
          name: 'ids',
          type: 'json',
          label: 'Plan IDs (JSON array of numbers)',
          admin: {
            description: 'e.g. [1, 2, 3] — leave empty to show all plans',
          },
        },
        {
          name: 'tags',
          type: 'json',
          label: 'Filter by Tags (JSON array of strings)',
          admin: {
            description: 'e.g. ["approved", "featured"]',
          },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'limit',
          type: 'number',
          label: 'Results per page',
          defaultValue: 12,
          min: 1,
          max: 100,
        },
        {
          name: 'paginate',
          type: 'checkbox',
          label: 'Enable pagination',
          defaultValue: true,
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Display Options',
      fields: [
        {
          type: 'row',
          fields: [
            {name: 'showListView', type: 'checkbox', label: 'Show list view toggle', defaultValue: true},
            {name: 'showThumbnails', type: 'checkbox', label: 'Show thumbnails', defaultValue: true},
          ],
        },
        {
          type: 'row',
          fields: [
            {name: 'showTitles', type: 'checkbox', label: 'Show titles', defaultValue: true},
            {name: 'showDescriptions', type: 'checkbox', label: 'Show descriptions', defaultValue: true},
          ],
        },
        {
          type: 'row',
          fields: [
            {name: 'showUpdatedAt', type: 'checkbox', label: 'Show updated date', defaultValue: true},
            {name: 'showTags', type: 'checkbox', label: 'Show tags', defaultValue: true},
          ],
        },
        {
          name: 'showModule',
          type: 'checkbox',
          label: 'Show module name',
          defaultValue: true,
        },
      ],
    },
  ],
};
