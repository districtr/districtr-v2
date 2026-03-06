import {Node, mergeAttributes} from '@tiptap/core';
import {ReactNodeViewRenderer} from '@tiptap/react';
import PlanGalleryNodeView from './PlanGalleryNodeView';
import {getJsonHtmlRenderer, getStandardHtmlParser} from '../extensionUtils';
import {
  getRichTextNodeSelector,
  PLAN_GALLERY_ATTRS,
  RICH_TEXT_DATA_ATTRIBUTES,
  RICH_TEXT_NODE_TYPES,
} from '@constants/cms/richText';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    planGalleryNode: {
      /**
       * Add a plan gallery section with custom content
       */
      setPlanGallery: (customContent?: object) => ReturnType;
    };
  }
}

export const PlanGalleryNode = Node.create({
  name: 'planGalleryNode',
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
        name: PLAN_GALLERY_ATTRS.IDS,
      },
      {
        name: PLAN_GALLERY_ATTRS.TAGS,
      },
      {
        name: PLAN_GALLERY_ATTRS.TITLE,
      },
      {
        name: PLAN_GALLERY_ATTRS.DESCRIPTION,
      },
      {
        name: PLAN_GALLERY_ATTRS.PAGINATE,
        default: true,
      },
      {
        name: PLAN_GALLERY_ATTRS.SHOW_LIST_VIEW,
        default: true,
      },
      {
        name: PLAN_GALLERY_ATTRS.SHOW_THUMBNAILS,
        default: true,
      },
      {
        name: PLAN_GALLERY_ATTRS.SHOW_TITLES,
        default: true,
      },
      {
        name: PLAN_GALLERY_ATTRS.SHOW_DESCRIPTIONS,
        default: true,
      },
      {
        name: PLAN_GALLERY_ATTRS.SHOW_UPDATED_AT,
        default: true,
      },
      {
        name: PLAN_GALLERY_ATTRS.SHOW_TAGS,
        default: true,
      },
      {
        name: PLAN_GALLERY_ATTRS.SHOW_MODULE,
        default: true,
      },
      {
        name: PLAN_GALLERY_ATTRS.LIMIT,
        default: 12,
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
        tag: getRichTextNodeSelector(RICH_TEXT_NODE_TYPES.PLAN_GALLERY),
      },
    ];
  },

  renderHTML({HTMLAttributes}) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        [RICH_TEXT_DATA_ATTRIBUTES.TYPE]: RICH_TEXT_NODE_TYPES.PLAN_GALLERY,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setPlanGallery:
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
          return ReactNodeViewRenderer(PlanGalleryNodeView);
        },
});

export default PlanGalleryNode;
