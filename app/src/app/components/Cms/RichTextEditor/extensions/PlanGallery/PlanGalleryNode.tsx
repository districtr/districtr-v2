import {Node, mergeAttributes} from '@tiptap/core';
import {ReactNodeViewRenderer} from '@tiptap/react';
import PlanGalleryNodeView from './PlanGalleryNodeView';
import {getJsonHtmlRenderer, getStandardHtmlParser} from '../extensionUtils';

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
    const attrs: {name: string; default?: any; parseHTML?: (element: Element) => any; renderHTML?: (attributes: Record<string, any>) => Record<string, any>}[] = [
      {
        name: 'ids',
      },
      {
        name: 'tags',
      },
      {
        name: 'title',
      },
      {
        name: 'description',
      },
      {
        name: 'paginate',
        default: true,
      },
      {
        name: 'showListView',
        default: true,
      },
      {
        name: 'showThumbnails',
        default: true,
      },
      {
        name: 'showTitles',
        default: true,
      },
      {
        name: 'showDescriptions',
        default: true,
      },
      {
        name: 'showUpdatedAt',
        default: true,
      },
      {
        name: 'showTags',
        default: true,
      },
      {
        name: 'showModule',
        default: true,
      },
      {
        name: 'limit',
        default: 12,
      },
    ];

    return attrs.reduce(
      (acc, attr) => {
        acc[attr.name] = {
          default: attr.default ?? null,
          parseHTML: attr.parseHTML ?? getStandardHtmlParser(attr.name),
          renderHTML: attr.renderHTML ?? getJsonHtmlRenderer(attr.name)
        };
        return acc;
      },
      {} as Record<string, any>
    );
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="plan-gallery-node"]',
      },
    ];
  },

  renderHTML({HTMLAttributes}) {
    return ['div', mergeAttributes(HTMLAttributes, {'data-type': 'plan-gallery-node'}), 0];
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
