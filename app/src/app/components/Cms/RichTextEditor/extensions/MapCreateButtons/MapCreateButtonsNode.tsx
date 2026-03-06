import {Node, mergeAttributes} from '@tiptap/core';
import {ReactNodeViewRenderer} from '@tiptap/react';
import MapCreateButtonsNodeView from './MapCreateButtonsNodeView';
import {getJsonHtmlRenderer, getStandardHtmlParser} from '../extensionUtils';
import {
  getRichTextNodeSelector,
  MAP_CREATE_BUTTONS_NODE_ATTRS,
  RICH_TEXT_DATA_ATTRIBUTES,
  RICH_TEXT_NODE_TYPES,
} from '@constants/cms/richText';

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
    const attrs: {
      name: string;
      default?: any;
      parseHTML?: (element: Element) => any;
      renderHTML?: (attributes: Record<string, any>) => Record<string, any>;
    }[] = [
      {
        name: MAP_CREATE_BUTTONS_NODE_ATTRS.VIEWS,
        default: [],
      },
      {
        name: MAP_CREATE_BUTTONS_NODE_ATTRS.TYPE,
        default: 'simple',
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
        tag: getRichTextNodeSelector(RICH_TEXT_NODE_TYPES.MAP_CREATE_BUTTONS),
      },
    ];
  },

  renderHTML({HTMLAttributes}) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        [RICH_TEXT_DATA_ATTRIBUTES.TYPE]: RICH_TEXT_NODE_TYPES.MAP_CREATE_BUTTONS,
      }),
      0,
    ];
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
