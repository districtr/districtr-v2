'use client';
import {NodeViewProps, NodeViewWrapper} from '@tiptap/react';
import React from 'react';
import {
  Box,
  Button,
  CheckboxCards,
  CheckboxGroup,
  Dialog,
  Flex,
  Heading,
  Switch,
  Tabs,
  Text,
  TextArea,
  TextField,
} from '@radix-ui/themes';
import {PlanGallery, PlanGalleryProps} from './PlanGallery';
import {GearIcon, TrashIcon} from '@radix-ui/react-icons';

const PlanGalleryNodeView: React.FC<NodeViewProps> = ({node, updateAttributes, deleteNode}) => {
  // Use a nested editor for the custom content
  const ids: number[] | undefined = node.attrs.ids || undefined;
  const tags: string[] | undefined = node.attrs.tags || undefined;
  const title: string | undefined = node.attrs.title || undefined;
  const description: string | undefined = node.attrs.description || undefined;
  const paginate: string | undefined = node.attrs.paginate || undefined;
  const limit: number | undefined = node.attrs.limit || undefined;
  const showListView: boolean | undefined = node.attrs.showListView || undefined;
  const showThumbnails: boolean | undefined = node.attrs.showThumbnails || undefined;
  const showTitles: boolean | undefined = node.attrs.showTitles || undefined;
  const showDescriptions: boolean | undefined = node.attrs.showDescriptions || undefined;
  const showUpdatedAt: boolean | undefined = node.attrs.showUpdatedAt || undefined;
  const showTags: boolean | undefined = node.attrs.showTags || undefined;
  const showModule: boolean | undefined = node.attrs.showModule || undefined;

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const handleUpdate = (updates: Partial<PlanGalleryProps>) => {
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
        showListView={showListView}
        showThumbnails={showThumbnails}
        showTitles={showTitles}
        showDescriptions={showDescriptions}
        showUpdatedAt={showUpdatedAt}
        showTags={showTags}
        showModule={showModule}
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
                      showThumbnails ? 'showThumbnails' : '',
                      showTitles ? 'showTitles' : '',
                      showDescriptions ? 'showDescriptions' : '',
                      showUpdatedAt ? 'showUpdatedAt' : '',
                      showTags ? 'showTags' : '',
                      showModule ? 'showModule' : '',
                    ]}
                    onValueChange={value => {
                      handleUpdate({
                        paginate: value.includes('paginate'),
                        showListView: value.includes('showListView'),
                        showThumbnails: value.includes('showThumbnails'),
                        showTitles: value.includes('showTitles'),
                        showDescriptions: value.includes('showDescriptions'),
                        showUpdatedAt: value.includes('showUpdatedAt'),
                        showTags: value.includes('showTags'),
                        showModule: value.includes('showModule'),
                      });
                    }}
                  >
                    <CheckboxCards.Item value="paginate">Paginate Results</CheckboxCards.Item>
                    <CheckboxCards.Item value="showListView">Show List View</CheckboxCards.Item>
                    <CheckboxCards.Item value="showThumbnails">Show Thumbnails</CheckboxCards.Item>
                    <CheckboxCards.Item value="showTitles">Show Titles</CheckboxCards.Item>
                    <CheckboxCards.Item value="showDescriptions">
                      Show Descriptions
                    </CheckboxCards.Item>
                    <CheckboxCards.Item value="showUpdatedAt">Show Updated At</CheckboxCards.Item>
                    <CheckboxCards.Item value="showTags">Show Tags</CheckboxCards.Item>
                    <CheckboxCards.Item value="showModule">Show Module</CheckboxCards.Item>
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
                    <ChipsPlanGalleryNodeView
                      entries={ids || []}
                      handleUpdate={handleUpdate}
                      property="ids"
                    />
                  </Tabs.Content>
                  <Tabs.Content value="tags">
                    <ChipsPlanGalleryNodeView
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

const ChipsPlanGalleryNodeView: React.FC<{
  entries: string[] | number[];
  handleUpdate: (updates: {[key: string]: string[] | number[]}) => void;
  property: string;
  showTitle?: boolean;
}> = ({entries, handleUpdate, property, showTitle = false}) => {
  const [text, setText] = React.useState('');
  return (
    <Flex direction="column" gap="2" py="4" mb="2" className="border-b border-gray-300">
      {showTitle && <Text>{property.charAt(0).toUpperCase() + property.slice(1)}</Text>}
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
        <Button
          onClick={() => {
            // @ts-expect-error
            handleUpdate({[property]: [...(entries || []), text]});
            setText('');
          }}
        >
          Add
        </Button>
      </Flex>
    </Flex>
  );
};

export default PlanGalleryNodeView;
