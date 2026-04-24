import {Node, mergeAttributes} from '@tiptap/core';
import {ReactNodeViewRenderer} from '@tiptap/react';
import BoilerplateNodeView from '@/app/components/Cms/RichTextEditor/extensions/Boilerplate/BoilerplateNodeView';
import {
  BOILERPLATE_ATTRIBUTE_NAME,
  RICH_TEXT_NODE_TYPES,
  NODE_TYPE_ATTR_NAME,
} from '@constants/cms';
import {getStandardHtmlParser, getJsonHtmlRenderer} from '../extensionUtils';

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
        parseHTML: getStandardHtmlParser(BOILERPLATE_ATTRIBUTE_NAME),
        renderHTML: getJsonHtmlRenderer(BOILERPLATE_ATTRIBUTE_NAME, 'customContent'),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `div[${NODE_TYPE_ATTR_NAME}="${RICH_TEXT_NODE_TYPES.BOILERPLATE}"]`,
      },
    ];
  },

  renderHTML({HTMLAttributes}) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {[NODE_TYPE_ATTR_NAME]: RICH_TEXT_NODE_TYPES.BOILERPLATE}),
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
