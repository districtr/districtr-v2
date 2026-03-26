import type {Block} from 'payload';

export const CommentGallery: Block = {
  slug: 'commentGallery',
  labels: {
    singular: 'Comment Gallery',
    plural: 'Comment Galleries',
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
      type: 'collapsible',
      label: 'Filters',
      fields: [
        {
          name: 'ids',
          type: 'json',
          label: 'Comment IDs (JSON array of numbers)',
          admin: {
            description: 'e.g. [10, 20] — leave empty to show all',
          },
        },
        {
          name: 'tags',
          type: 'json',
          label: 'Filter by Tags (JSON array of strings)',
          admin: {
            description: 'e.g. ["verified", "featured"]',
          },
        },
        {
          type: 'row',
          fields: [
            {name: 'place', type: 'text', label: 'Place'},
            {name: 'state', type: 'text', label: 'State'},
            {name: 'zipCode', type: 'text', label: 'Zip Code'},
          ],
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
          defaultValue: 10,
          min: 1,
          max: 100,
        },
        {
          name: 'paginate',
          type: 'checkbox',
          label: 'Enable pagination',
          defaultValue: true,
        },
        {
          name: 'showFilters',
          type: 'checkbox',
          label: 'Show user filters',
          defaultValue: false,
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
            {name: 'showIdentifier', type: 'checkbox', label: 'Show identifier', defaultValue: true},
            {name: 'showTitles', type: 'checkbox', label: 'Show titles', defaultValue: true},
          ],
        },
        {
          type: 'row',
          fields: [
            {name: 'showPlaces', type: 'checkbox', label: 'Show places', defaultValue: true},
            {name: 'showStates', type: 'checkbox', label: 'Show states', defaultValue: true},
          ],
        },
        {
          type: 'row',
          fields: [
            {name: 'showZipCodes', type: 'checkbox', label: 'Show zip codes', defaultValue: true},
            {name: 'showCreatedAt', type: 'checkbox', label: 'Show created date', defaultValue: true},
          ],
        },
        {
          type: 'row',
          fields: [
            {name: 'showListView', type: 'checkbox', label: 'Show list view toggle', defaultValue: true},
            {name: 'showMaps', type: 'checkbox', label: 'Show maps', defaultValue: true},
          ],
        },
      ],
    },
  ],
};
