import type {Block} from 'payload';

export const Boilerplate: Block = {
  slug: 'boilerplate',
  labels: {
    singular: 'Boilerplate / Data Explainer',
    plural: 'Boilerplates',
  },
  fields: [
    {
      name: 'customContent',
      type: 'json',
      label: 'Custom Content',
      admin: {
        description:
          'Optional JSON object for custom boilerplate content. Leave null to use the default data explainer.',
      },
    },
  ],
};
