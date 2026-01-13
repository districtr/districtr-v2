import {Node, mergeAttributes} from '@tiptap/core';
import {ReactNodeViewRenderer} from '@tiptap/react';
import CommentGalleryNodeView from './CommentGalleryNodeView';
import {getJsonHtmlRenderer, getStandardHtmlParser} from '../extensionUtils';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentGalleryNode: {
      /**
       * Add a plan gallery section with custom content
       */
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

  // for serverside rendering, don't render the node. DOM replacement is handled in RichTextView
  addNodeView:
    typeof window === 'undefined'
      ? undefined
      : () => {
          return ReactNodeViewRenderer(CommentGalleryNodeView);
        },
});

export default CommentGalleryNode;
