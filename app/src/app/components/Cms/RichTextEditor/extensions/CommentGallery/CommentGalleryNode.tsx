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
import {
  COMMENT_GALLERY_ATTRS,
  getRichTextNodeSelector,
  RICH_TEXT_DATA_ATTRIBUTES,
  RICH_TEXT_NODE_TYPES,
} from '@constants/cms/richText';

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
        name: COMMENT_GALLERY_ATTRS.TITLE,
      },
      {
        name: COMMENT_GALLERY_ATTRS.DESCRIPTION,
      },
      {
        name: COMMENT_GALLERY_ATTRS.IDS,
      },
      {
        name: COMMENT_GALLERY_ATTRS.TAGS,
      },
      {
        name: COMMENT_GALLERY_ATTRS.PLACE,
      },
      {
        name: COMMENT_GALLERY_ATTRS.STATE,
      },
      {
        name: COMMENT_GALLERY_ATTRS.ZIP_CODE,
      },
      {
        name: COMMENT_GALLERY_ATTRS.LIMIT,
        default: 10,
      },
      {
        name: COMMENT_GALLERY_ATTRS.SHOW_IDENTIFIER,
        default: true,
      },
      {
        name: COMMENT_GALLERY_ATTRS.SHOW_TITLES,
        default: true,
      },
      {
        name: COMMENT_GALLERY_ATTRS.SHOW_PLACES,
        default: true,
      },
      {
        name: COMMENT_GALLERY_ATTRS.SHOW_STATES,
        default: true,
      },
      {
        name: COMMENT_GALLERY_ATTRS.SHOW_ZIP_CODES,
        default: true,
      },
      {
        name: COMMENT_GALLERY_ATTRS.SHOW_CREATED_AT,
        default: true,
      },
      {
        name: COMMENT_GALLERY_ATTRS.SHOW_LIST_VIEW,
        default: true,
      },
      {
        name: COMMENT_GALLERY_ATTRS.PAGINATE,
        default: true,
      },
      {
        name: COMMENT_GALLERY_ATTRS.SHOW_FILTERS,
        default: false,
      },
      {
        name: COMMENT_GALLERY_ATTRS.SHOW_MAPS,
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
        tag: getRichTextNodeSelector(RICH_TEXT_NODE_TYPES.COMMENT_GALLERY),
      },
    ];
  },

  renderHTML({HTMLAttributes}) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        [RICH_TEXT_DATA_ATTRIBUTES.TYPE]: RICH_TEXT_NODE_TYPES.COMMENT_GALLERY,
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
