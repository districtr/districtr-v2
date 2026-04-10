import {Node, mergeAttributes} from '@tiptap/core';
import {ReactNodeViewRenderer} from '@tiptap/react';
import {ContentHeader} from '@/app/components/Static/ContentHeader';
import ContentHeaderNodeView from './SectionHeaderNodeView';
import {
  RICH_TEXT_NODE_TYPES,
  SECTION_HEADER_ATTRIBUTE_NAME,
  NODE_TYPE_ATTR_NAME,
} from '@constants/cms';
import {getJsonHtmlRenderer, getStandardHtmlParser} from '../extensionUtils';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sectionHeaderNode: {
      /**
       * Add a boilerplate section with custom content
       */
      setSectionHeader: (customContent?: object) => ReturnType;
    };
  }
}

export const SectionHeaderNode = Node.create({
  name: 'sectionHeaderNode',
  group: 'block',
  content: 'inline*',
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      title: {
        default: null,
        parseHTML: getStandardHtmlParser(SECTION_HEADER_ATTRIBUTE_NAME),
        renderHTML: getJsonHtmlRenderer(SECTION_HEADER_ATTRIBUTE_NAME),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `div[${NODE_TYPE_ATTR_NAME}="${RICH_TEXT_NODE_TYPES.SECTION_HEADER}"]`,
      },
    ];
  },

  renderHTML({HTMLAttributes}) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {[NODE_TYPE_ATTR_NAME]: RICH_TEXT_NODE_TYPES.SECTION_HEADER}),
      0,
    ];
  },

  addCommands() {
    return {
      setSectionHeader:
        (title = undefined) =>
        ({commands}) => {
          return commands.insertContent({
            type: this.name,
            attrs: {title},
          });
        },
    };
  },

  // for serverside rendering, don't render the node. DOM replacement is handled in RichTextView
  addNodeView:
    typeof window === 'undefined'
      ? undefined
      : () => {
          return ReactNodeViewRenderer(ContentHeaderNodeView);
        },
});

export default SectionHeaderNode;
