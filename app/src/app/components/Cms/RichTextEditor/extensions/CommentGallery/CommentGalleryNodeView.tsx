'use client';
import {NodeViewProps, NodeViewWrapper} from '@tiptap/react';
import React, {useRef} from 'react';
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
import {CommentGallery, CommentGalleryProps} from './CommentGallery';
import {GearIcon, TrashIcon} from '@radix-ui/react-icons';
import {NoFocusBoundary} from '../NoFocusBoundary';
import {CmsSettingsChips} from '../EditHelpers/CmsSettingsChips';

const CommentGalleryNodeView: React.FC<NodeViewProps> = ({node, updateAttributes, deleteNode}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  // Use a nested editor for the custom content
  const ids: number[] | undefined = node.attrs.ids || undefined;
  const tags: string[] | undefined = node.attrs.tags || undefined;
  const limit: number | undefined = node.attrs.limit || undefined;
  const place: string | undefined = node.attrs.place || undefined;
  const state: string | undefined = node.attrs.state || undefined;
  const zipCode: string | undefined = node.attrs.zipCode || undefined;
  const paginate: boolean | undefined = node.attrs.paginate || undefined;
  const showListView: boolean | undefined = node.attrs.showListView || undefined;
  const showTitles: boolean | undefined = node.attrs.showTitles || undefined;
  const showPlaces: boolean | undefined = node.attrs.showPlaces || undefined;
  const showStates: boolean | undefined = node.attrs.showStates || undefined;
  const showZipCodes: boolean | undefined = node.attrs.showZipCodes || undefined;
  const showCreatedAt: boolean | undefined = node.attrs.showCreatedAt || undefined;
  const showIdentitifier: boolean | undefined = node.attrs.showIdentitifier || undefined;

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const handleUpdate = (updates: Partial<CommentGalleryProps>) => {
    const newAttrs = {
      ...node.attrs,
      ...updates,
    };
    updateAttributes(newAttrs);
  };

  return (
    <NodeViewWrapper className="relative" ref={parentRef} contentEditable={false}>
      <NoFocusBoundary parentRef={parentRef}>
        <CommentGallery
          _ids={ids}
          _tags={tags}
          _place={place}
          _state={state}
          _zipCode={zipCode}
          _limit={limit}
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
                  <Text>Display Options</Text>
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
                    <CheckboxCards.Item value="showIdentitifier">Show Identitifier</CheckboxCards.Item>
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
