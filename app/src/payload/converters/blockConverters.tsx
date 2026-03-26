/**
 * Lexical Block → JSX converters for Payload CMS rich text rendering.
 *
 * Maps each Payload Lexical block type to its corresponding React component.
 * Used by Payload's `<RichText />` component to render rich text content on
 * public-facing pages.
 *
 * The renderer components are the same ones used by the old Tiptap system —
 * they just receive props directly from the Lexical block data instead of
 * being parsed from HTML data attributes.
 */

import React from 'react';
import type {JSXConverters} from '@payloadcms/richtext-lexical/react';

// Lazy-load the heavy renderer components to avoid bundling them in admin.
// These use named exports, so we wrap them for React.lazy compatibility.
const PlanGallery = React.lazy(() =>
  import('@/app/components/Cms/RichTextEditor/extensions/PlanGallery/PlanGallery').then(m => ({
    default: m.PlanGallery,
  }))
);
const CommentGallery = React.lazy(() =>
  import('@/app/components/Cms/RichTextEditor/extensions/CommentGallery/CommentGallery').then(m => ({
    default: m.CommentGallery,
  }))
);
const CommentSubmissionForm = React.lazy(() =>
  import('@/app/components/Forms/CommentSubmissionForm').then(m => ({
    default: m.CommentSubmissionForm,
  }))
);
const MapCreateButtons = React.lazy(() =>
  import('@/app/components/Cms/RichTextEditor/extensions/MapCreateButtons/MapCreateButtons').then(
    m => ({default: m.MapCreateButtons})
  )
);

// Helper to safely extract block fields
function f(node: {fields?: Record<string, unknown>}): Record<string, unknown> {
  return (node.fields ?? {}) as Record<string, unknown>;
}

/**
 * JSX converters for custom Lexical blocks.
 *
 * Usage in a page component:
 * ```tsx
 * import { RichText } from '@payloadcms/richtext-lexical/react';
 * import { blockConverters } from '@/payload/converters/blockConverters';
 *
 * <RichText data={content.body} converters={blockConverters} />
 * ```
 */
export const blockConverters: JSXConverters = {
  blocks: {
    planGallery: ({node}) => {
      const fields = f(node);
      return (
        <React.Suspense fallback={<div>Loading gallery...</div>}>
          <PlanGallery
            ids={fields.ids as number[] | undefined}
            tags={fields.tags as string[] | undefined}
            title={(fields.title as string) || ''}
            description={(fields.description as string) || ''}
            paginate={fields.paginate as boolean | undefined}
            showListView={fields.showListView as boolean | undefined}
            showThumbnails={fields.showThumbnails as boolean | undefined}
            showTitles={fields.showTitles as boolean | undefined}
            showDescriptions={fields.showDescriptions as boolean | undefined}
            showUpdatedAt={fields.showUpdatedAt as boolean | undefined}
            showTags={fields.showTags as boolean | undefined}
            showModule={fields.showModule as boolean | undefined}
            limit={fields.limit as number | undefined}
          />
        </React.Suspense>
      );
    },

    commentGallery: ({node}) => {
      const fields = f(node);
      return (
        <React.Suspense fallback={<div>Loading comments...</div>}>
          <CommentGallery
            ids={fields.ids as number[] | undefined}
            tags={fields.tags as string[] | undefined}
            place={fields.place as string | undefined}
            state={fields.state as string | undefined}
            zipCode={fields.zipCode as string | undefined}
            title={(fields.title as string) || ''}
            description={(fields.description as string) || ''}
            limit={fields.limit as number | undefined}
            showIdentifier={fields.showIdentifier as boolean | undefined}
            showTitles={fields.showTitles as boolean | undefined}
            showPlaces={fields.showPlaces as boolean | undefined}
            showStates={fields.showStates as boolean | undefined}
            showZipCodes={fields.showZipCodes as boolean | undefined}
            showCreatedAt={fields.showCreatedAt as boolean | undefined}
            showListView={fields.showListView as boolean | undefined}
            paginate={fields.paginate as boolean | undefined}
            showFilters={fields.showFilters as boolean | undefined}
            showMaps={fields.showMaps as boolean | undefined}
          />
        </React.Suspense>
      );
    },

    commentSubmissionForm: ({node}) => {
      const fields = f(node);
      return (
        <React.Suspense fallback={<div>Loading form...</div>}>
          <CommentSubmissionForm
            mandatoryTags={(fields.mandatoryTags as string[]) || []}
            allowListModules={(fields.allowListModules as string[]) || []}
          />
        </React.Suspense>
      );
    },

    mapCreateButtons: ({node}) => {
      const fields = f(node);
      return (
        <React.Suspense fallback={<div>Loading...</div>}>
          <MapCreateButtons
            views={(fields.views as Array<{name: string; districtr_map_slug: string}>) || []}
            type={(fields.type as 'simple' | 'megaphone') || 'simple'}
          />
        </React.Suspense>
      );
    },

    boilerplate: ({node}) => {
      const fields = f(node);
      const BoilerplateContent = React.lazy(
        () =>
          import(
            '@/app/components/Cms/RichTextEditor/extensions/Boilerplate/BoilerplateNodeRenderer'
          )
      );
      return (
        <React.Suspense fallback={<div>Loading...</div>}>
          <BoilerplateContent
            customContent={fields.customContent as Record<string, unknown> | undefined}
          />
        </React.Suspense>
      );
    },

    sectionHeader: ({node}) => {
      const fields = f(node);
      const title = (fields.title as string) || '';
      return (
        <div className="section-header my-8 border-b-2 border-gray-200 pb-2">
          <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
        </div>
      );
    },
  },
};
