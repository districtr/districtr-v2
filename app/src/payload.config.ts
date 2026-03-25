import {buildConfig} from 'payload';
import {postgresAdapter} from '@payloadcms/db-postgres';
import {lexicalEditor} from '@payloadcms/richtext-lexical';
import sharp from 'sharp';
import path from 'path';
import {fileURLToPath} from 'url';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  admin: {
    user: 'users',
    meta: {
      titleSuffix: '- Districtr Admin',
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
      },
    },
  },
  collections: [
    {
      slug: 'users',
      auth: true,
      admin: {
        useAsTitle: 'email',
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
      ],
      access: {
        read: () => true,
        create: ({req}) => req.user?.role === 'admin',
        update: ({req}) => req.user?.role === 'admin',
        delete: ({req}) => req.user?.role === 'admin',
      },
    },
  ],
  editor: lexicalEditor(),
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
