import {Node, mergeAttributes} from '@tiptap/core';
import {ReactNodeViewRenderer} from '@tiptap/react';
import BoilerplateNodeView from '@/app/components/Cms/RichTextEditor/extensions/Boilerplate/BoilerplateNodeView';
import {
  getRichTextNodeSelector,
  RICH_TEXT_DATA_ATTRIBUTES,
  RICH_TEXT_NODE_TYPES,
} from '@constants/cms/richText';

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
          const content = element.getAttribute(RICH_TEXT_DATA_ATTRIBUTES.CUSTOM_CONTENT);
          return content ? JSON.parse(content) : null;
        },
        renderHTML: attributes => {
          return {
            [RICH_TEXT_DATA_ATTRIBUTES.CUSTOM_CONTENT]: attributes.customContent
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
        tag: getRichTextNodeSelector(RICH_TEXT_NODE_TYPES.BOILERPLATE),
      },
    ];
  },

  renderHTML({HTMLAttributes}) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        [RICH_TEXT_DATA_ATTRIBUTES.TYPE]: RICH_TEXT_NODE_TYPES.BOILERPLATE,
      }),
      0,
    ];
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

  // for serverside rendering, don't render the node. DOM replacement is handled in RichTextView
  addNodeView:
    typeof window === 'undefined'
      ? undefined
      : () => {
          return ReactNodeViewRenderer(BoilerplateNodeView);
        },
});

export default BoilerplateNode;
