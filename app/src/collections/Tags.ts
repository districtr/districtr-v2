import type {CollectionConfig} from 'payload';

export const Tags: CollectionConfig = {
  slug: 'tags',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'language', 'districtrMapSlug', '_status', 'updatedAt'],
    group: 'CMS Content',
    baseListFilter: ({req}) => {
      if (req.user?.role === 'admin') return {};
      if (req.user?.assignedTags?.length) {
        return {id: {in: req.user.assignedTags.map((t: any) => t.id || t)}};
      }
      return {};
    },
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
          unique: false, // unique per slug+language, handled by compound index
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
      label: 'Page Content',
    },
  ],
  access: {
    read: () => true,
    create: ({req}) => req.user?.role === 'admin' || req.user?.role === 'editor',
    update: ({req}) => {
      if (req.user?.role === 'admin') return true;
      if (req.user?.role === 'editor') {
        if (req.user?.assignedTags?.length) {
          return {id: {in: req.user.assignedTags.map((t: any) => t.id || t)}};
        }
        return true;
      }
      return false;
    },
    delete: ({req}) => req.user?.role === 'admin',
  },
};
