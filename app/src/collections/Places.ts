import type {CollectionConfig} from 'payload';

export const Places: CollectionConfig = {
  slug: 'places',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'language', '_status', 'updatedAt'],
    group: 'CMS Content',
  },
  versions: {
    drafts: true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Page Title',
    },
    {
      name: 'subtitle',
      type: 'text',
      label: 'Subtitle',
    },
    {
      type: 'row',
      fields: [
        {
          name: 'slug',
          type: 'text',
          required: true,
          unique: false,
          index: true,
          label: 'URL Slug',
          admin: {
            description: 'URL-friendly identifier (lowercase, hyphens only)',
          },
          validate: (value: string | null | undefined) => {
            if (!value) return 'Slug is required';
            if (!/^[a-z0-9-]+$/.test(value)) {
              return 'Slug must contain only lowercase letters, numbers, and hyphens';
            }
            return true;
          },
        },
        {
          name: 'language',
          type: 'select',
          required: true,
          defaultValue: 'en',
          options: [
            {label: 'English', value: 'en'},
            {label: 'Spanish', value: 'es'},
            {label: 'Chinese', value: 'zh'},
            {label: 'Vietnamese', value: 'vi'},
            {label: 'Haitian', value: 'ht'},
            {label: 'Portuguese', value: 'pt'},
          ],
          index: true,
        },
      ],
    },
    {
      name: 'districtrMapSlugs',
      type: 'json',
      label: 'Districtr Map Slugs',
      admin: {
        description: 'JSON array of map slugs associated with this place. e.g. ["cook-county", "chicago"]',
      },
    },
    {
      name: 'body',
      type: 'richText',
      label: 'Page Content',
    },
  ],
  access: {
    read: () => true,
    create: ({req}) => req.user?.role === 'admin' || req.user?.role === 'editor',
    update: ({req}) => req.user?.role === 'admin' || req.user?.role === 'editor',
    delete: ({req}) => req.user?.role === 'admin',
  },
};
