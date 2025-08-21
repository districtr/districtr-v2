import {Node, mergeAttributes} from '@tiptap/core';
import {ReactNodeViewRenderer} from '@tiptap/react';
import FormNodeView from './FormNodeView';
import {getJsonHtmlRenderer, getStandardHtmlParser} from '../extensionUtils';

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
    const attrs: {
      name: string;
      default?: any;
      parseHTML?: (element: Element) => any;
      renderHTML?: (attributes: Record<string, any>) => Record<string, any>;
    }[] = [
      {
        name: 'mandatoryTags',
        default: [],
      },
      {
        name: 'allowListModules',
        default: [],
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
