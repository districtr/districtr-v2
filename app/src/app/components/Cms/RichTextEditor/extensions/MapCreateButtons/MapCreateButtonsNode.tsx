import {Node, mergeAttributes} from '@tiptap/core';
import {ReactNodeViewRenderer} from '@tiptap/react';
import MapCreateButtonsNodeView from './MapCreateButtonsNodeView';
import {getJsonHtmlRenderer, getStandardHtmlParser} from '../extensionUtils';
import {RICH_TEXT_NODE_TYPES, MAP_CREATE_BUTTONS_ATTRIBUTES, NODE_TYPE_ATTRIBUTE_NAME} from '@constants/cms';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mapCreateButtonsNode: {
      /**
       * Add a map create buttons section with custom content
       */
      setMapCreateButtons: (customContent?: object) => ReturnType;
    };
  }
}

export const MapCreateButtonsNode = Node.create({
  name: 'mapCreateButtonsNode',
  group: 'block',
  content: 'inline*',
  defining: true,
  isolating: true,
  addAttributes() {
    return Object.fromEntries(
      MAP_CREATE_BUTTONS_ATTRIBUTES.map(attr => [
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
        tag: `div[${NODE_TYPE_ATTRIBUTE_NAME}="${RICH_TEXT_NODE_TYPES.MAP_CREATE_BUTTONS}"]`,
      },
    ];
  },

  renderHTML({HTMLAttributes}) {
    return ['div', mergeAttributes(HTMLAttributes, {[NODE_TYPE_ATTRIBUTE_NAME]: RICH_TEXT_NODE_TYPES.MAP_CREATE_BUTTONS}), 0];
  },

  addCommands() {
    return {
      setMapCreateButtons:
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
          return ReactNodeViewRenderer(MapCreateButtonsNodeView);
        },
});

export default MapCreateButtonsNode;
