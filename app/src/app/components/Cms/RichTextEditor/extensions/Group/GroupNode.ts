import {Node, mergeAttributes} from '@tiptap/core';
import {ReactNodeViewRenderer} from '@tiptap/react';
import GroupNodeView from './GroupNodeView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    groupNode: {
      /**
       * Add a group section with custom content
       */
      setGroup: (customContent?: object) => ReturnType;
    };
  }
}

export const GroupNode = Node.create({
  name: 'groupNode',
  group: 'block',
  content: 'inline*',
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      customContent: {
        default: null,
        parseHTML: element => {
          const content = element.getAttribute('data-custom-content');
          return content ? JSON.parse(content) : null;
        },
        renderHTML: attributes => {
          return {
            'data-custom-content': attributes.customContent
              ? JSON.stringify(attributes.customContent)
              : '',
          };
        },
      },
      groupSlugs: {
        default: [],
        parseHTML: element => {
          const slugs = element.getAttribute('data-group-slugs');
          return slugs ? JSON.parse(slugs) : [];
        },
        renderHTML: attributes => {
          return {
            'data-group-slugs': attributes.groupSlugs
              ? JSON.stringify(attributes.groupSlugs)
              : '[]',
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="group-node"]',
      },
    ];
  },

  renderHTML({HTMLAttributes}) {
    return ['div', mergeAttributes(HTMLAttributes, {'data-type': 'group-node'}), 0];
  },

  addCommands() {
    return {
      setGroup:
        (customContent = undefined) =>
        ({commands}) => {
          return commands.insertContent({
            type: this.name,
            attrs: {customContent},
          });
        },
    };
  },

  // for serverside rendering, don't render the node. DOM replacement is handled in RichTextView
  addNodeView:
    typeof window === 'undefined'
      ? undefined
      : () => {
          return ReactNodeViewRenderer(GroupNodeView);
        },
});

export default GroupNode;
