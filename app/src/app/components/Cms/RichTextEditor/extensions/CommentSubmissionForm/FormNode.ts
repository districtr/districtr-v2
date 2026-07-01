import {Node, mergeAttributes} from '@tiptap/core';
import {ReactNodeViewRenderer} from '@tiptap/react';
import FormNodeView from './FormNodeView';
import {getJsonHtmlRenderer, getStandardHtmlParser} from '../extensionUtils';
import {RICH_TEXT_NODE_TYPES, FORM_ATTRIBUTES, NODE_TYPE_ATTR_NAME} from '@constants/cms';

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
    return Object.fromEntries(
      FORM_ATTRIBUTES.map(attr => [
        attr.name,
        {
          default: attr.default ?? null,
          parseHTML: getStandardHtmlParser(attr.name),
          renderHTML: getJsonHtmlRenderer(attr.name),
        },
      ])
    );
  },
  parseHTML() {
    return [
      {
        tag: `div[${NODE_TYPE_ATTR_NAME}="${RICH_TEXT_NODE_TYPES.FORM}"]`,
      },
    ];
  },

  renderHTML({HTMLAttributes}) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {[NODE_TYPE_ATTR_NAME]: RICH_TEXT_NODE_TYPES.FORM}),
      0,
    ];
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
