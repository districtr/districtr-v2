import {Node, mergeAttributes} from '@tiptap/core';
import {ReactNodeViewRenderer} from '@tiptap/react';
import {ContentHeader} from '@/app/components/Static/ContentHeader';
import ContentHeaderNodeView from './SectionHeaderNodeView';

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
          const content = element.getAttribute('data-title');
          return content ? JSON.parse(content) : null;
        },
        renderHTML: attributes => {
          return {
            'data-title': attributes.title ? JSON.stringify(attributes.title) : '',
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="section-header-node"]',
      },
    ];
  },

  renderHTML({HTMLAttributes}) {
    return ['div', mergeAttributes(HTMLAttributes, {'data-type': 'section-header-node'}), 0];
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
