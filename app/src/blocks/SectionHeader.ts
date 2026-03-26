import type {Block} from 'payload';

export const SectionHeader: Block = {
  slug: 'sectionHeader',
  labels: {
    singular: 'Section Header',
    plural: 'Section Headers',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      label: 'Section Title',
      required: true,
    },
  ],
};
