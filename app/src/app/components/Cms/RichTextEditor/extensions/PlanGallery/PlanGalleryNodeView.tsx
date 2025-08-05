'use client';
import {NodeViewProps, NodeViewWrapper} from '@tiptap/react';
import React from 'react';
import {Box, Button, Dialog, Flex, Heading, Switch, Text, TextField} from '@radix-ui/themes';
import {PlanGallery} from './PlanGallery';
import {GearIcon, TrashIcon} from '@radix-ui/react-icons';

const PlanGalleryNodeView: React.FC<NodeViewProps> = ({node, updateAttributes, deleteNode}) => {
  // Use a nested editor for the custom content
  const ids: number[] | undefined = node.attrs.ids || undefined;
  const tags: string[] | undefined = node.attrs.tags || undefined;
  const title: string | undefined = node.attrs.title || undefined;
  const description: string | undefined = node.attrs.description || undefined;
  const paginate: string | undefined = node.attrs.paginate || undefined;
  const limit: number | undefined = node.attrs.limit || undefined;

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const handleUpdate = (updates: {
    ids?: number[];
    tags?: string[];
    title?: string;
    description?: string;
    paginate?: string;
    limit?: number;
  }) => {
    const newAttrs = {
      ...node.attrs,
      ...updates,
    };
    updateAttributes(newAttrs);
  };

  return (
    <NodeViewWrapper className="relative">
      <PlanGallery
        ids={ids}
        tags={tags}
        title={title ?? ''}
        description={description ?? ''}
        paginate={paginate === 'true'}
        limit={limit}
      />
      <Box position="absolute" top="2" right="2">
        <Flex direction="column" gap="2">
          <Dialog.Root open={dialogOpen}>
            <Dialog.Trigger>
              <Button className="p-2 !cursor-pointer" onClick={() => setDialogOpen(true)}>
                <GearIcon />
              </Button>
            </Dialog.Trigger>
            <Dialog.Content>
              <Flex direction="column" gapY="4">
                <Heading as="h4">Editing Plan Gallery</Heading>
                <TextField.Root
                  placeholder="Title"
                  value={title}
                  onChange={e => handleUpdate({title: e.target.value})}
                />
                <TextField.Root
                  placeholder="Description"
                  value={description}
                  onChange={e => handleUpdate({description: e.target.value})}
                />
                <Flex direction="row" gap="2">
                  <Text>Paginate</Text>
                  <Switch checked={paginate === 'true'} onCheckedChange={e => handleUpdate({paginate: e ? 'true' : 'false'})} />
                </Flex>
                <ChipsPlanGalleryNodeView
                  entries={ids || []}
                  handleUpdate={handleUpdate}
                  property="ids"
                />
                <ChipsPlanGalleryNodeView
                  entries={tags || []}
                  handleUpdate={handleUpdate}
                  property="tags"
                />
              </Flex>
              <Flex direction="row" gap="2">
                <Button onClick={() => setDialogOpen(false)}>Close</Button>
              </Flex>
            </Dialog.Content>
          </Dialog.Root>
          <Button onClick={deleteNode} color="red" variant="soft">
            <TrashIcon />
          </Button>
        </Flex>
      </Box>
    </NodeViewWrapper>
  );
};

const ChipsPlanGalleryNodeView: React.FC<{
  entries: string[] | number[];
  handleUpdate: (updates: {[key: string]: string[] | number[]}) => void;
  property: string;
}> = ({entries, handleUpdate, property}) => {
  const [text, setText] = React.useState('');
  return (
    <Flex direction="column" gap="2" pb="4" mb="2" className="border-b border-gray-300">
      <Text>{property.charAt(0).toUpperCase() + property.slice(1)}</Text>
      <Box>
        {entries?.map((entry, i) => (
          <Button

            className="hover:bg-red-500 hover:text-white w-auto mr-2"
            variant="outline"
            // @ts-expect-error
            onClick={() => handleUpdate({[property]: entries.filter(t => t !== entry)})}
            key={i}
          >
            {entry} &times;
          </Button>
        ))}
      </Box>
      <Flex direction="row" gap="2">
        <TextField.Root
          placeholder={`Add a ${property}`}
          value={text}
          onChange={e => setText(e.target.value)}
        />
        {/* @ts-expect-error */}
        <Button onClick={() => handleUpdate({[property]: [...(entries || []), text]})}>Add</Button>
      </Flex>
    </Flex>
  );
};

export default PlanGalleryNodeView;
