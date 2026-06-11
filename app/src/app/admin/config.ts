export const pages = [
  {
    title: 'Content Management',
    description:
      'Create and manage content pages, galleries, users, and map data in the Districtr CMS.',
    href: `${process.env.NEXT_PUBLIC_CMS_URL ?? 'http://localhost:8001'}/admin/`,
    cta: 'Go to CMS',
  },
  {
    title: 'Comment Review',
    description:
      'Review and moderate form comments, tags, and commenters (excludes district comments).',
    href: '/admin/review',
    cta: 'Go to Review',
  },
  {
    title: 'District Comments',
    description: 'Moderate zone-level comments on maps. Look up by document ID.',
    href: '/admin/review/district-comments',
    cta: 'District Comments',
  },
  {
    title: 'Thumbnail Generation',
    description: 'Generate or update thumbnails for maps',
    href: '/admin/thumbnails',
    cta: 'Go to Thumbnail Generation',
  },
];
