import type {Block} from 'payload';

export const MapCreateButtons: Block = {
  slug: 'mapCreateButtons',
  labels: {
    singular: 'Map Create Buttons',
    plural: 'Map Create Buttons',
  },
  fields: [
    {
      name: 'views',
      type: 'json',
      label: 'Map Module Views',
      defaultValue: [],
      admin: {
        description:
          'JSON array of {name, districtr_map_slug} objects. e.g. [{"name": "Cook County", "districtr_map_slug": "cook-county"}]',
      },
    },
    {
      name: 'type',
      type: 'select',
      label: 'Layout Style',
      defaultValue: 'simple',
      options: [
        {label: 'Simple (horizontal buttons)', value: 'simple'},
        {label: 'Megaphone (hero section)', value: 'megaphone'},
      ],
    },
  ],
};
