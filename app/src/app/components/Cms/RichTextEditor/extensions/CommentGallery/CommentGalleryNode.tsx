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
import type {CommentGalleryProps} from './CommentGallery';
import {getJsonHtmlRenderer, getStandardHtmlParser} from '../extensionUtils';
import {
  RICH_TEXT_NODE_TYPES,
  COMMENT_GALLERY_ATTRIBUTES,
  NODE_TYPE_ATTR_NAME,
} from '@constants/cms';

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
    return Object.fromEntries(
      COMMENT_GALLERY_ATTRIBUTES.map(attr => [
        attr.name,
        {
          default: attr.default ?? null,
          parseHTML: getStandardHtmlParser(attr.name),
          renderHTML: getJsonHtmlRenderer(attr.name),
        },
      ])
    ) as Record<keyof CommentGalleryProps, any>;
  },

  parseHTML() {
    return [
      {
        tag: `div[${NODE_TYPE_ATTR_NAME}="${RICH_TEXT_NODE_TYPES.COMMENT_GALLERY}"]`,
      },
    ];
  },

  renderHTML({HTMLAttributes}) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        [NODE_TYPE_ATTR_NAME]: RICH_TEXT_NODE_TYPES.COMMENT_GALLERY,
      }),
      0,
    ];
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
