'use client';

import {NodeViewProps, NodeViewWrapper} from '@tiptap/react';
import React, {useRef} from 'react';
import {Box, Button, CheckboxCards, Dialog, Flex, Heading, Tabs, Text, TextArea, TextField} from '@radix-ui/themes';
import {CommentGallery, CommentGalleryProps} from './CommentGallery';
import {GearIcon, TrashIcon} from '@radix-ui/react-icons';
import {NoFocusBoundary} from '../NoFocusBoundary';
import {CmsSettingsChips} from '../EditHelpers/CmsSettingsChips';

const CommentGalleryNodeView: React.FC<NodeViewProps> = ({node, updateAttributes, deleteNode}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  // Use a nested editor for the custom content
  const {
    ids,
    tags,
    limit,
    place,
    state,
    zipCode,
    title,
    description,
    paginate,
    showListView,
    showIdentitifier,
    showTitles,
    showPlaces,
    showStates,
    showZipCodes,
    showCreatedAt,
  } = node.attrs as CommentGalleryProps;

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const handleUpdate = (updates: Partial<CommentGalleryProps>) => {
    const newAttrs = {
      ...node.attrs,
      ...updates,
    };
    updateAttributes(newAttrs);
  };

  return (
    <NodeViewWrapper className="relative border-[1px] border-blue-500 my-4 rounded-md border-dashed" ref={parentRef} contentEditable={false}>
      <NoFocusBoundary parentRef={parentRef}>
        <CommentGallery
          ids={ids}
          tags={tags}
          place={place}
          state={state}
          zipCode={zipCode}
          limit={limit}
        />
      </NoFocusBoundary>
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
                <Heading as="h4">Editing Comment Gallery</Heading>
                <Flex direction="column" gap="2">
                  <Text>Title</Text>
                  <TextField.Root
                    placeholder="Title"
                    value={title}
                    onChange={e => handleUpdate({title: e.target.value})}
                  />
                </Flex>
                <Flex direction="column" gap="2">
                  <Text>Description</Text>
                  <TextArea
                    placeholder="Description"
                    value={description}
                    onChange={e => handleUpdate({description: e.target.value})}
                  />
                </Flex>

                <Flex direction="column" gap="2">
                  <Text>Display Options</Text>
                  <CheckboxCards.Root
                    className="w-full"
                    columns={{
                      initial: '2',
                      md: '3',
                      lg: '4',
                    }}
                    value={[
                      paginate ? 'paginate' : '',
                      showListView ? 'showListView' : '',
                      showIdentitifier ? 'showIdentitifier' : '',
                      showTitles ? 'showTitles' : '',
                      showPlaces ? 'showPlaces' : '',
                      showStates ? 'showStates' : '',
                      showZipCodes ? 'showZipCodes' : '',
                      showCreatedAt ? 'showCreatedAt' : '',
                    ]}
                    onValueChange={value => {
                      handleUpdate({
                        paginate: value.includes('paginate'),
                        showListView: value.includes('showListView'),
                        showTitles: value.includes('showTitles'),
                        showPlaces: value.includes('showPlaces'),
                        showStates: value.includes('showStates'),
                        showZipCodes: value.includes('showZipCodes'),
                        showCreatedAt: value.includes('showCreatedAt'),
                        showIdentitifier: value.includes('showIdentitifier'),
                      });
                    }}
                  >
                    <CheckboxCards.Item value="paginate">Paginate Results</CheckboxCards.Item>
                    <CheckboxCards.Item value="showListView">Show List View</CheckboxCards.Item>
                    <CheckboxCards.Item value="showIdentitifier">
                      Show Identitifier
                    </CheckboxCards.Item>
                    <CheckboxCards.Item value="showTitles">Show Titles</CheckboxCards.Item>
                    <CheckboxCards.Item value="showPlaces">Show Places</CheckboxCards.Item>
                    <CheckboxCards.Item value="showStates">Show States</CheckboxCards.Item>
                    <CheckboxCards.Item value="showZipCodes">Show Zip Codes</CheckboxCards.Item>
                    <CheckboxCards.Item value="showCreatedAt">Show Created At</CheckboxCards.Item>
                  </CheckboxCards.Root>
                </Flex>

                <Tabs.Root
                  defaultValue={!!ids ? 'ids' : 'tags'}
                  onValueChange={value =>
                    handleUpdate({[value]: [], [value === 'ids' ? 'tags' : 'ids']: null})
                  }
                >
                  <Tabs.List>
                    <Tabs.Trigger value="ids">IDs</Tabs.Trigger>
                    <Tabs.Trigger value="tags">Tags</Tabs.Trigger>
                  </Tabs.List>
                  <Tabs.Content value="ids">
                    <CmsSettingsChips
                      entries={ids || []}
                      handleUpdate={handleUpdate}
                      property="ids"
                    />
                  </Tabs.Content>
                  <Tabs.Content value="tags">
                    <CmsSettingsChips
                      entries={tags || []}
                      handleUpdate={handleUpdate}
                      property="tags"
                    />
                  </Tabs.Content>
                </Tabs.Root>
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

export default CommentGalleryNodeView;
