import {Node, mergeAttributes} from '@tiptap/core';
import {ReactNodeViewRenderer} from '@tiptap/react';
import {ContentHeader} from '@/app/components/Static/ContentHeader';
import ContentHeaderNodeView from './SectionHeaderNodeView';
import {
  getRichTextNodeSelector,
  RICH_TEXT_DATA_ATTRIBUTES,
  RICH_TEXT_NODE_TYPES,
} from '@constants/cms/richText';

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
        parseHTML: element => {
          const content = element.getAttribute(RICH_TEXT_DATA_ATTRIBUTES.TITLE);
          return content ? JSON.parse(content) : null;
        },
        renderHTML: attributes => {
          return {
            [RICH_TEXT_DATA_ATTRIBUTES.TITLE]: attributes.title
              ? JSON.stringify(attributes.title)
              : '',
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: getRichTextNodeSelector(RICH_TEXT_NODE_TYPES.SECTION_HEADER),
      },
    ];
  },

  renderHTML({HTMLAttributes}) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        [RICH_TEXT_DATA_ATTRIBUTES.TYPE]: RICH_TEXT_NODE_TYPES.SECTION_HEADER,
      }),
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
