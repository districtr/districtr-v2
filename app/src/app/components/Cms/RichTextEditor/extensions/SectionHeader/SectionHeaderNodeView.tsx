'use client';
import {NodeViewProps, NodeViewWrapper} from '@tiptap/react';
import React from 'react';
import {Heading, IconButton, TextField} from '@radix-ui/themes';
import { TrashIcon } from '@radix-ui/react-icons';

const ContentHeaderNodeView: React.FC<NodeViewProps> = ({node, updateAttributes, deleteNode}) => {
  const title = node.attrs.title || null;

  return (
    <NodeViewWrapper className="relative">
      <Heading as="h2" className="font-bold p-4 bg-gray-100" size="6">
        <TextField.Root value={title} onChange={e => updateAttributes({title: e.target.value})} variant="surface" className="w-full font-size-6 bg-gray-100" />
      </Heading>
      <IconButton variant="ghost" size="1" onClick={deleteNode} className="absolute top-0 right-[-1rem]">
        <TrashIcon />
      </IconButton>
    </NodeViewWrapper>
  );
};

export default ContentHeaderNodeView;
