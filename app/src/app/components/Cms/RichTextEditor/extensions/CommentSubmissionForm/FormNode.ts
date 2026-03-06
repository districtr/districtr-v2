import {Node, mergeAttributes} from '@tiptap/core';
import {ReactNodeViewRenderer} from '@tiptap/react';
import FormNodeView from './FormNodeView';
import {getJsonHtmlRenderer, getStandardHtmlParser} from '../extensionUtils';
import {
  FORM_NODE_ATTRS,
  getRichTextNodeSelector,
  RICH_TEXT_DATA_ATTRIBUTES,
  RICH_TEXT_NODE_TYPES,
} from '@constants/cms/richText';

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
        name: FORM_NODE_ATTRS.MANDATORY_TAGS,
        default: [],
      },
      {
        name: FORM_NODE_ATTRS.ALLOW_LIST_MODULES,
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
        tag: getRichTextNodeSelector(RICH_TEXT_NODE_TYPES.FORM),
      },
    ];
  },

  renderHTML({HTMLAttributes}) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        [RICH_TEXT_DATA_ATTRIBUTES.TYPE]: RICH_TEXT_NODE_TYPES.FORM,
      }),
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
