import { NodeViewProps, NodeViewWrapper } from '@tiptap/react'
import React from 'react'
import { Box, Heading } from '@radix-ui/themes';

const BoilerplateNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes }) => {
  const customText = node.attrs.customText || ''

  return (
    <NodeViewWrapper className="boilerplate-node border border-gray-300 rounded-md px-4 bg-gray-50">
      <Heading as="h2">About the data</Heading>
      <Box className="custom-text-container">
        <textarea
          className="w-full p-2 border border-gray-300 rounded-md"
          value={customText}
          placeholder="Add your custom text here..."
          onChange={(e) => updateAttributes({ customText: e.target.value })}
        />
      </Box>
    </NodeViewWrapper>
  )
}

export default BoilerplateNodeView