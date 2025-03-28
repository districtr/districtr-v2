import {Node, mergeAttributes} from '@tiptap/core';
import {ReactNodeViewRenderer} from '@tiptap/react';
import BoilerplateNodeView from './BoilerplateNodeView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    boilerplateNode: {
      /**
       * Add a boilerplate section with custom content
       */
      setBoilerplate: (customContent?: object) => ReturnType;
    };
  }
}

export const BoilerplateNode = Node.create({
  name: 'boilerplateNode',
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
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="boilerplate-node"]',
      },
    ];
  },

  renderHTML({HTMLAttributes}) {
    return ['div', mergeAttributes(HTMLAttributes, {'data-type': 'boilerplate-node'}), 0];
  },

  addCommands() {
    return {
      setBoilerplate:
        (customContent = undefined) =>
        ({commands}) => {
          return commands.insertContent({
            type: this.name,
            attrs: {customContent},
          });
        },
    };
  },

  addNodeView: // for serverside rendering, don't render the node. DOM replacement is handled in RichTextView
    typeof window === 'undefined'
      ? undefined
      : () => {
          return ReactNodeViewRenderer(BoilerplateNodeView);
        },
});

export default BoilerplateNode;
