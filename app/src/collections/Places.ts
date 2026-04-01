import type {CollectionConfig} from 'payload';
import {APIError} from 'payload';

export const Places: CollectionConfig = {
  slug: 'places',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'workflowStatus', '_status', 'updatedAt'],
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
  hooks: {
    beforeChange: [
      ({data, req}) => {
        // Only admins can set _status to 'published'
        if (data._status === 'published' && req.user?.role !== 'admin') {
          throw new APIError('Only admins can publish content. Submit for review instead.', 403);
        }
        // Auto-set workflowStatus when publishing
        if (data._status === 'published') {
          data.workflowStatus = 'approved';
        }
        return data;
      },
    ],
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
        description:
          'JSON array of map slugs associated with this place. e.g. ["cook-county", "chicago"]',
      },
    },
    {
      name: 'body',
      type: 'richText',
      localized: true,
      label: 'Page Content',
    },
    {
      name: 'workflowStatus',
      type: 'select',
      defaultValue: 'draft',
      options: [
        {label: 'Draft', value: 'draft'},
        {label: 'Pending Review', value: 'pending_review'},
        {label: 'Approved', value: 'approved'},
        {label: 'Changes Requested', value: 'changes_requested'},
      ],
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
      access: {
        update: ({req}) => req.user?.role === 'admin',
      },
    },
    {
      name: 'reviewNotes',
      type: 'textarea',
      admin: {
        position: 'sidebar',
        description: 'Notes from the reviewer about requested changes',
        condition: (data) => data.workflowStatus === 'changes_requested',
      },
    },
    {
      name: 'workflowActions',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: {
          Field: '@/app/components/PayloadAdmin/WorkflowSidebar',
        },
      },
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
