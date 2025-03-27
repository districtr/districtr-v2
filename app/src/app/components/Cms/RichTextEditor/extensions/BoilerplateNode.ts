import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import BoilerplateNodeView from './BoilerplateNodeView'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    boilerplateNode: {
      /**
       * Add a boilerplate section with custom content
       */
      setBoilerplate: (customText: string) => ReturnType
    }
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
      customText: {
        default: '',
        parseHTML: element => element.getAttribute('data-custom-text'),
        renderHTML: attributes => {
          return {
            'data-custom-text': attributes.customText,
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="boilerplate-node"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'boilerplate-node' }), 0]
  },

  addCommands() {
    return {
      setBoilerplate: (customText: string) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: { customText },
        })
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(BoilerplateNodeView)
  },
})

export default BoilerplateNode