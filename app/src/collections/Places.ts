import type {CollectionConfig} from 'payload';

export const Places: CollectionConfig = {
  slug: 'places',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', '_status', 'updatedAt'],
    group: 'CMS Content',
    baseListFilter: ({req}) => {
      if (req.user?.role === 'admin') return {};
      if (req.user?.assignedPlaces?.length) {
        return {id: {in: req.user.assignedPlaces.map((p: any) => p.id || p)}};
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
      localized: true,
      label: 'Page Content',
    },
  ],
  access: {
    read: () => true,
    create: ({req}) => req.user?.role === 'admin' || req.user?.role === 'editor',
    update: ({req}) => {
      if (req.user?.role === 'admin') return true;
      if (req.user?.role === 'editor') {
        if (req.user?.assignedPlaces?.length) {
          return {id: {in: req.user.assignedPlaces.map((p: any) => p.id || p)}};
        }
        return true;
      }
      return false;
    },
    delete: ({req}) => req.user?.role === 'admin',
  },
};
