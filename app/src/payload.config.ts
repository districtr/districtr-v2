import {buildConfig} from 'payload';
import {postgresAdapter} from '@payloadcms/db-postgres';
import {lexicalEditor, BlocksFeature} from '@payloadcms/richtext-lexical';
import sharp from 'sharp';
import path from 'path';
import {fileURLToPath} from 'url';

import {Tags} from './collections/Tags';
import {Places} from './collections/Places';
import {
  PlanGallery,
  CommentGallery,
  CommentSubmissionForm,
  MapCreateButtons,
  Boilerplate,
  SectionHeader,
} from './blocks';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  admin: {
    user: 'users',
    meta: {
      titleSuffix: '- Districtr Admin',
    },
    livePreview: {
      url: ({data, collectionConfig}) => {
        const slug = data?.slug || 'preview';
        const type = collectionConfig?.slug; // 'tags' or 'places'
        const route = type === 'tags' ? 'tag' : 'place';
        return `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/${route}/${slug}?preview=true`;
      },
      collections: ['tags', 'places'],
      breakpoints: [
        {label: 'Mobile', name: 'mobile', width: 375, height: 812},
        {label: 'Tablet', name: 'tablet', width: 768, height: 1024},
        {label: 'Desktop', name: 'desktop', width: 1280, height: 800},
      ],
    },
    components: {
      afterNavLinks: ['@/app/components/PayloadViews/AdminNavLinks'],
      views: {
        commentReview: {
          Component: '@/app/components/PayloadViews/CommentReviewView',
          path: '/comment-review',
          meta: {
            title: 'Comment Review',
            description: 'Review and moderate form comments',
          },
        },
        districtComments: {
          Component: '@/app/components/PayloadViews/DistrictCommentsView',
          path: '/district-comments',
          meta: {
            title: 'District Comments',
            description: 'Moderate zone-level comments on maps',
          },
        },
        thumbnails: {
          Component: '@/app/components/PayloadViews/ThumbnailGenerationView',
          path: '/thumbnails',
          meta: {
            title: 'Thumbnail Generation',
            description: 'Generate or update thumbnails for maps',
          },
        },
        pendingReviews: {
          Component: '@/app/components/PayloadViews/PendingReviewsView',
          path: '/pending-reviews',
          meta: {
            title: 'Pending Reviews',
            description: 'Review content submissions awaiting approval',
          },
        },
      },
    },
  },
  collections: [
    // Auth
    {
      slug: 'users',
      auth: true,
      admin: {
        useAsTitle: 'email',
        group: 'Admin',
      },
      fields: [
        {
          name: 'role',
          type: 'select',
          required: true,
          defaultValue: 'editor',
          options: [
            {label: 'Admin', value: 'admin'},
            {label: 'Editor', value: 'editor'},
            {label: 'Reviewer', value: 'reviewer'},
          ],
          saveToJWT: true,
          admin: {
            position: 'sidebar',
          },
        },
        {
          name: 'assignedTags',
          type: 'relationship',
          relationTo: 'tags',
          hasMany: true,
          saveToJWT: true,
          admin: {
            description: 'Tags this user can edit. Leave empty for unrestricted access.',
            condition: (data) => data.role === 'editor',
          },
        },
        {
          name: 'assignedPlaces',
          type: 'relationship',
          relationTo: 'places',
          hasMany: true,
          saveToJWT: true,
          admin: {
            description: 'Places this user can edit. Leave empty for unrestricted access.',
            condition: (data) => data.role === 'editor',
          },
        },
      ],
      access: {
        read: () => true,
        create: ({req}) => req.user?.role === 'admin',
        update: ({req}) => req.user?.role === 'admin',
        delete: ({req}) => req.user?.role === 'admin',
      },
    },
    // CMS Content
    Tags,
    Places,
  ],
  editor: lexicalEditor({
    features: ({defaultFeatures}) => [
      ...defaultFeatures,
      BlocksFeature({
        blocks: [
          PlanGallery,
          CommentGallery,
          CommentSubmissionForm,
          MapCreateButtons,
          Boilerplate,
          SectionHeader,
        ],
      }),
    ],
  }),
  localization: {
    locales: [
      {label: 'English', code: 'en'},
      {label: 'Spanish', code: 'es'},
      {label: 'Chinese', code: 'zh'},
      {label: 'Vietnamese', code: 'vi'},
      {label: 'Haitian Creole', code: 'ht'},
      {label: 'Portuguese', code: 'pt'},
    ],
    defaultLocale: 'en',
    fallback: true,
  },
  secret: process.env.PAYLOAD_SECRET || 'default-secret-change-me',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    schemaName: 'payload',
  }),
  sharp,
});
