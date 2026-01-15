/**
 * CommentGalleryNode - TipTap extension for embedding comment galleries in CMS content.
 *
 * This node allows CMS editors to insert a configurable comment gallery that:
 * - Filters comments by IDs, tags, or location
 * - Shows/hides specific fields (title, name, place, etc.)
 * - Supports pagination and grid/list view modes
 *
 * The node is rendered as a <div data-type="comment-gallery-node"> in HTML,
 * which is then hydrated by DomNodeRenderers.tsx on the frontend.
 */
import {Node, mergeAttributes} from '@tiptap/core';
import {ReactNodeViewRenderer} from '@tiptap/react';
import CommentGalleryNodeView from './CommentGalleryNodeView';
import {getJsonHtmlRenderer, getStandardHtmlParser} from '../extensionUtils';

// Extend TipTap's command interface to include our custom command
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentGalleryNode: {
      /** Insert a comment gallery node at the current cursor position */
      setCommentGallery: (customContent?: object) => ReturnType;
    };
  }
}

export const CommentGalleryNode = Node.create({
  name: 'commentGalleryNode',
  group: 'block',
  content: 'inline*',
  defining: true,
  isolating: true,
  // Define all configurable attributes for the node
  // These map to CommentGalleryProps and are serialized to HTML data attributes
  addAttributes() {
    const attrs: {
      name: string;
      default?: any;
      parseHTML?: (element: Element) => any;
      renderHTML?: (attributes: Record<string, any>) => Record<string, any>;
    }[] = [
      {
        name: 'title',
      },
      {
        name: 'description',
      },
      {
        name: 'ids',
      },
      {
        name: 'tags',
      },
      {
        name: 'place',
      },
      {
        name: 'state',
      },
      {
        name: 'zipCode',
      },
      {
        name: 'limit',
        default: 10,
      },
      {
        name: 'showIdentifier',
        default: true,
      },
      {
        name: 'showTitles',
        default: true,
      },
      {
        name: 'showPlaces',
        default: true,
      },
      {
        name: 'showStates',
        default: true,
      },
      {
        name: 'showZipCodes',
        default: true,
      },
      {
        name: 'showCreatedAt',
        default: true,
      },
      {
        name: 'showListView',
        default: true,
      },
      {
        name: 'paginate',
        default: true,
      },
      {
        name: 'showFilters',
        default: false,
      },
      {
        name: 'showMaps',
        default: true,
      },
    ];

    return attrs.reduce(
      (acc, attr) => {
        acc[attr.name] = {
          default: attr.default ?? null,
          parseHTML: attr.parseHTML ?? getStandardHtmlParser(attr.name),
          renderHTML: attr.renderHTML ?? getJsonHtmlRenderer(attr.name),
        };
        return acc;
      },
      {} as Record<string, any>
    );
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="comment-gallery-node"]',
      },
    ];
  },

  renderHTML({HTMLAttributes}) {
    return ['div', mergeAttributes(HTMLAttributes, {'data-type': 'comment-gallery-node'}), 0];
  },

  addCommands() {
    return {
      setCommentGallery:
        (attrs = undefined) =>
        ({commands}) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },

  // Client-side only: render the React component for editing
  // Server-side: returns undefined, and DOM replacement is handled by DomNodeRenderers.tsx
  addNodeView:
    typeof window === 'undefined'
      ? undefined
      : () => {
          return ReactNodeViewRenderer(CommentGalleryNodeView);
        },
});

export default CommentGalleryNode;
