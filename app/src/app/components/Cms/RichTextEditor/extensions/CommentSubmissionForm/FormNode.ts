import {Node, mergeAttributes} from '@tiptap/core';
import {ReactNodeViewRenderer} from '@tiptap/react';
import FormNodeView from './FormNodeView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    formNode: {
      /**
       * Add a form node with custom content
       */
      setForm: (attrs?: object) => ReturnType;
    };
  }
}

export const FormNode = Node.create({
  name: 'formNode',
  group: 'block',
  content: 'inline*',
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      mandatoryTags: {
        default: [],
        parseHTML: element => {
          const content = element.getAttribute('data-mandatory-tags');
          return content ? JSON.parse(content) : [];
        },
        renderHTML: attributes => {
          return {
            'data-mandatory-tags': attributes.mandatoryTags
              ? JSON.stringify(attributes.mandatoryTags)
              : '',
          };
        },
      },
      allowListModules: {
        default: [],
        parseHTML: element => {
          const content = element.getAttribute('data-allow-list-modules');
          return content ? JSON.parse(content) : [];
        },
        renderHTML: attributes => {
          return {
            'data-allow-list-modules': attributes.allowListModules
              ? JSON.stringify(attributes.allowListModules)
              : '',
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="form-node"]',
      },
    ];
  },

  renderHTML({HTMLAttributes}) {
    return ['div', mergeAttributes(HTMLAttributes, {'data-type': 'form-node'}), 0];
  },

  addCommands() {
    return {
      setForm:
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
          return ReactNodeViewRenderer(FormNodeView);
        },
});

export default FormNode;
