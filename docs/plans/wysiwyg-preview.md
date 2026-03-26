# WYSIWYG Preview Side-by-Side with Payload Editor Plan

## Current State

The Payload admin uses Lexical's rich text editor for the `body` field on Tags and Places. The editor renders content in Payload's admin styling, which differs significantly from the public-facing site (Radix UI themes, Tailwind prose classes, custom block components). Editors can't see what the published page will look like while editing.

## Goal

Provide a live preview panel alongside the Payload editor that renders content exactly as it appears on the public site, including all custom blocks (PlanGallery, CommentGallery, CommentSubmissionForm, etc.).

## Approach: Payload's Live Preview Feature

Payload 3.0 has a built-in Live Preview feature that renders an iframe of the actual frontend page, updated in real-time as the editor types.

### Implementation Steps

1. **Enable Live Preview in payload.config.ts**
   ```ts
   admin: {
     livePreview: {
       url: ({ data, collectionConfig }) => {
         const slug = data?.slug || 'preview';
         const type = collectionConfig?.slug; // 'tags' or 'places'
         const route = type === 'tags' ? 'tag' : 'place';
         return `${process.env.NEXT_PUBLIC_SITE_URL}/${route}/${slug}?preview=true`;
       },
       collections: ['tags', 'places'],
       breakpoints: [
         { label: 'Mobile', name: 'mobile', width: 375, height: 812 },
         { label: 'Tablet', name: 'tablet', width: 768, height: 1024 },
         { label: 'Desktop', name: 'desktop', width: 1280, height: 800 },
       ],
     },
   }
   ```

2. **Add preview mode to tag/place pages**
   - Use Payload's `useLivePreview` hook or Next.js Draft Mode
   - When `?preview=true` is in the URL, fetch draft content instead of published
   - Use Payload's `draftMode()` from `next/headers` for server components

   ```ts
   // In tag/[slug]/page.tsx
   import { draftMode } from 'next/headers';

   export default async function Page({ params }) {
     const { isEnabled: isDraft } = await draftMode();
     const payloadData = await getPayloadCmsContent(slug, language, 'tags', isDraft);
     // ... render with RichText component as usual
   }
   ```

3. **Update payloadCms.ts to support draft queries**
   ```ts
   export async function getPayloadCmsContent(
     slug: string,
     language: string,
     type: 'tags' | 'places',
     draft: boolean = false,
   ) {
     const payload = await getPayload({ config });
     const result = await payload.find({
       collection: type,
       where: { slug: { equals: slug } },
       draft, // When true, returns latest draft version
     });
     // ...
   }
   ```

4. **Enable Draft Mode API route** for Payload's preview iframe
   - Payload sends a request to enable Next.js draft mode before loading the preview iframe
   - Create an API route at `app/(app)/api/preview/route.ts`
   ```ts
   import { draftMode } from 'next/headers';
   import { NextResponse } from 'next/server';

   export async function GET(request: Request) {
     const { searchParams } = new URL(request.url);
     const secret = searchParams.get('secret');

     if (secret !== process.env.PAYLOAD_SECRET) {
       return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
     }

     (await draftMode()).enable();
     return NextResponse.json({ draft: true });
   }
   ```

5. **Add RefreshRouteOnSave** to the frontend layout
   - Payload provides a `RefreshRouteOnSave` component that listens for changes from the admin and refreshes the preview iframe
   ```ts
   import { RefreshRouteOnSave } from '@payloadcms/live-preview-react';

   // In the tag/place page layout or component:
   <RefreshRouteOnSave />
   ```

### Alternative: Custom Side-by-Side Panel

If the iframe-based Live Preview doesn't provide enough control, a custom approach:

1. **Create a Payload admin field component** that renders alongside the Lexical editor
2. The component subscribes to the Lexical editor state via Payload's `useField` hook
3. It passes the current editor content to the `<RichText />` component with `blockConverters`
4. Wrap in the public site's styling (Tailwind prose, Radix Theme)
5. Register as a `admin.components.afterInput` on the `body` field

This gives a true side-by-side experience within the admin panel itself, without needing an iframe or separate page load.

### Key Files
- `app/src/payload.config.ts` — add `livePreview` configuration
- `app/src/app/(app)/(static)/tag/[slug]/page.tsx` — add draft mode support
- `app/src/app/(app)/(static)/place/[slug]/page.tsx` — add draft mode support
- `app/src/app/utils/api/payloadCms.ts` — add `draft` parameter
- New: `app/src/app/(app)/api/preview/route.ts` — draft mode API route

### Effort Estimate
2-4 days (Live Preview approach), 4-6 days (custom side-by-side panel)

### Recommendation
Start with Payload's built-in Live Preview — it requires minimal code and gives editors a real preview with responsive breakpoints. If the iframe approach feels sluggish or limiting, upgrade to the custom panel later.
