import type {CollectionConfig} from 'payload';
import {APIError} from 'payload';

export const Tags: CollectionConfig = {
  slug: 'tags',
  admin: {
    useAsTitle: 'title',
    defaultColumns: [
      'title',
      'slug',
      'language',
      'districtrMapSlug',
      'workflowStatus',
      '_status',
      'updatedAt',
    ],
    group: 'CMS Content',
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
    update: ({req}) => req.user?.role === 'admin' || req.user?.role === 'editor',
    delete: ({req}) => req.user?.role === 'admin',
  },
};
