import type {CollectionConfig} from 'payload';

export const Tags: CollectionConfig = {
  slug: 'tags',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'districtrMapSlug', '_status', 'updatedAt'],
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
      localized: true,
      label: 'Page Title',
    },
    {
      name: 'subtitle',
      type: 'text',
      localized: true,
      label: 'Subtitle',
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
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
      name: 'districtrMapSlug',
      type: 'text',
      label: 'Districtr Map Slug',
      index: true,
      admin: {
        description: 'Slug of the associated Districtr map',
      },
    },
    {
      name: 'body',
      type: 'richText',
      localized: true,
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
