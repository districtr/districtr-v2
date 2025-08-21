import {Node, mergeAttributes} from '@tiptap/core';
import {ReactNodeViewRenderer} from '@tiptap/react';
import MapCreateButtonsNodeView from './MapCreateButtonsNodeView';
import {getJsonHtmlRenderer, getStandardHtmlParser} from '../extensionUtils';

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
        name: 'views',
        default: [],
      },
      {
        name: 'type',
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
        tag: 'div[data-type="map-create-buttons-node"]',
      },
    ];
  },

  renderHTML({HTMLAttributes}) {
    return ['div', mergeAttributes(HTMLAttributes, {'data-type': 'map-create-buttons-node'}), 0];
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
