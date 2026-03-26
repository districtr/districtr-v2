import type {Block} from 'payload';

export const CommentSubmissionForm: Block = {
  slug: 'commentSubmissionForm',
  labels: {
    singular: 'Comment Submission Form',
    plural: 'Comment Submission Forms',
  },
  fields: [
    {
      name: 'mandatoryTags',
      type: 'json',
      label: 'Mandatory Tags',
      defaultValue: [],
      admin: {
        description:
          'JSON array of tag strings that will be auto-included in submissions. e.g. ["redistricting", "public-input"]',
      },
    },
    {
      name: 'allowListModules',
      type: 'json',
      label: 'Allowed Map Modules',
      defaultValue: [],
      admin: {
        description:
          'JSON array of module slugs users can select from. e.g. ["cook-county", "detroit"]. Leave empty to allow all.',
      },
    },
  ],
};
