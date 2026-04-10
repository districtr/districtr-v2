import {Node, mergeAttributes} from '@tiptap/core';
import {ReactNodeViewRenderer} from '@tiptap/react';
import PlanGalleryNodeView from './PlanGalleryNodeView';
import type {PlanGalleryProps} from './PlanGallery';
import {getJsonHtmlRenderer, getStandardHtmlParser} from '../extensionUtils';
import {RICH_TEXT_NODE_TYPES, PLAN_GALLERY_ATTRIBUTES, NODE_TYPE_ATTR_NAME} from '@constants/cms';

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
    return Object.fromEntries(
      PLAN_GALLERY_ATTRIBUTES.map(attr => [
        attr.name,
        {
          default: attr.default ?? null,
          parseHTML: getStandardHtmlParser(attr.name),
          renderHTML: getJsonHtmlRenderer(attr.name),
        },
      ])
    ) as Record<keyof PlanGalleryProps, any>;
  },

  parseHTML() {
    return [
      {
        tag: `div[${NODE_TYPE_ATTR_NAME}="${RICH_TEXT_NODE_TYPES.PLAN_GALLERY}"]`,
      },
    ];
  },

  renderHTML({HTMLAttributes}) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {[NODE_TYPE_ATTR_NAME]: RICH_TEXT_NODE_TYPES.PLAN_GALLERY}),
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
