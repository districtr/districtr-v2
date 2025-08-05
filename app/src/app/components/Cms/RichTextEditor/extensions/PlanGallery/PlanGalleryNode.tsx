import {Node, mergeAttributes} from '@tiptap/core';
import {ReactNodeViewRenderer} from '@tiptap/react';
import PlanGalleryNodeView from './PlanGalleryNodeView';

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
    return {
      ids: {
        default: null,
        parseHTML: element => {
          const content = element.getAttribute('ids');
          return content ? JSON.parse(content) : null;
        },
      },
      tags: {
        default: null,
        parseHTML: element => {
          const content = element.getAttribute('tags');
          return content ? JSON.parse(content) : null;
        },
      },
      title: {
        default: null,
        parseHTML: element => {
          const content = element.getAttribute('title');
          return content ? JSON.parse(content) : null;
        },
      },
      description: {
        default: null,
        parseHTML: element => {
          const content = element.getAttribute('description');
          return content ? JSON.parse(content) : null;
        },
      },
      paginate: {
        default: false,
        parseHTML: element => {
          const content = element.getAttribute('paginate');
          return content ? JSON.parse(content) : false;
        },
      },
      limit: {
        default: 12,
        parseHTML: element => {
          const content = element.getAttribute('limit');
          return content ? JSON.parse(content) : 12;
        },
      },
    };
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
