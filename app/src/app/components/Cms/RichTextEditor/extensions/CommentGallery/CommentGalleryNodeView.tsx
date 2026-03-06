'use client';

import {NodeViewProps, NodeViewWrapper} from '@tiptap/react';
import React, {useRef} from 'react';
import {
  Box,
  Button,
  CheckboxCards,
  Dialog,
  Flex,
  Heading,
  Tabs,
  Text,
  TextArea,
  TextField,
} from '@radix-ui/themes';
import {CommentGallery, CommentGalleryProps} from './CommentGallery';
import {GearIcon, TrashIcon} from '@radix-ui/react-icons';
import {NoFocusBoundary} from '../NoFocusBoundary';
import {CmsSettingsChips} from '../EditHelpers/CmsSettingsChips';
import {
  COMMENT_GALLERY_ATTRS,
  COMMENT_GALLERY_DISPLAY_OPTIONS,
  GALLERY_FILTER_TABS,
  type CommentGalleryDisplayOptionKey,
} from '@constants/cms/richText';

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
    showIdentifier,
    showTitles,
    showPlaces,
    showStates,
    showZipCodes,
    showCreatedAt,
    showFilters,
    showMaps,
  } = node.attrs as CommentGalleryProps;

  const displayOptionState: Record<CommentGalleryDisplayOptionKey, boolean> = {
    [COMMENT_GALLERY_ATTRS.PAGINATE]: Boolean(paginate),
    [COMMENT_GALLERY_ATTRS.SHOW_LIST_VIEW]: Boolean(showListView),
    [COMMENT_GALLERY_ATTRS.SHOW_IDENTIFIER]: Boolean(showIdentifier),
    [COMMENT_GALLERY_ATTRS.SHOW_TITLES]: Boolean(showTitles),
    [COMMENT_GALLERY_ATTRS.SHOW_PLACES]: Boolean(showPlaces),
    [COMMENT_GALLERY_ATTRS.SHOW_STATES]: Boolean(showStates),
    [COMMENT_GALLERY_ATTRS.SHOW_ZIP_CODES]: Boolean(showZipCodes),
    [COMMENT_GALLERY_ATTRS.SHOW_CREATED_AT]: Boolean(showCreatedAt),
    [COMMENT_GALLERY_ATTRS.SHOW_FILTERS]: Boolean(showFilters),
    [COMMENT_GALLERY_ATTRS.SHOW_MAPS]: Boolean(showMaps),
  };

  const selectedDisplayOptions = COMMENT_GALLERY_DISPLAY_OPTIONS.filter(option => {
    return displayOptionState[option.key];
  }).map(option => option.key);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const handleUpdate = (updates: Partial<CommentGalleryProps>) => {
    const newAttrs = {
      ...node.attrs,
      ...updates,
    };
    updateAttributes(newAttrs);
  };

  return (
    <NodeViewWrapper
      className="relative border-[1px] border-blue-500 my-4 rounded-md border-dashed"
      ref={parentRef}
      contentEditable={false}
    >
      <NoFocusBoundary parentRef={parentRef}>
        <CommentGallery
          ids={ids}
          tags={tags}
          place={place}
          state={state}
          zipCode={zipCode}
          limit={limit}
          showFilters={showFilters}
          showMaps={showMaps}
          showIdentifier={showIdentifier}
          showTitles={showTitles}
          showPlaces={showPlaces}
          showStates={showStates}
          showZipCodes={showZipCodes}
          showCreatedAt={showCreatedAt}
          showListView={showListView}
          paginate={paginate}
          title={title}
          description={description}
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
                    value={selectedDisplayOptions}
                    onValueChange={value => {
                      const selectedValues = new Set(value);
                      handleUpdate({
                        paginate: selectedValues.has(COMMENT_GALLERY_ATTRS.PAGINATE),
                        showListView: selectedValues.has(COMMENT_GALLERY_ATTRS.SHOW_LIST_VIEW),
                        showTitles: selectedValues.has(COMMENT_GALLERY_ATTRS.SHOW_TITLES),
                        showPlaces: selectedValues.has(COMMENT_GALLERY_ATTRS.SHOW_PLACES),
                        showStates: selectedValues.has(COMMENT_GALLERY_ATTRS.SHOW_STATES),
                        showZipCodes: selectedValues.has(COMMENT_GALLERY_ATTRS.SHOW_ZIP_CODES),
                        showCreatedAt: selectedValues.has(COMMENT_GALLERY_ATTRS.SHOW_CREATED_AT),
                        showIdentifier: selectedValues.has(COMMENT_GALLERY_ATTRS.SHOW_IDENTIFIER),
                        showFilters: selectedValues.has(COMMENT_GALLERY_ATTRS.SHOW_FILTERS),
                        showMaps: selectedValues.has(COMMENT_GALLERY_ATTRS.SHOW_MAPS),
                      });
                    }}
                  >
                    {COMMENT_GALLERY_DISPLAY_OPTIONS.map(option => (
                      <CheckboxCards.Item key={option.key} value={option.key}>
                        {option.label}
                      </CheckboxCards.Item>
                    ))}
                  </CheckboxCards.Root>
                </Flex>

                <Tabs.Root
                  defaultValue={!!ids ? GALLERY_FILTER_TABS.IDS : GALLERY_FILTER_TABS.TAGS}
                  onValueChange={value =>
                    handleUpdate({
                      [value]: [],
                      [value === GALLERY_FILTER_TABS.IDS
                        ? GALLERY_FILTER_TABS.TAGS
                        : GALLERY_FILTER_TABS.IDS]: null,
                    })
                  }
                >
                  <Tabs.List>
                    <Tabs.Trigger value={GALLERY_FILTER_TABS.IDS}>IDs</Tabs.Trigger>
                    <Tabs.Trigger value={GALLERY_FILTER_TABS.TAGS}>Tags</Tabs.Trigger>
                  </Tabs.List>
                  <Tabs.Content value={GALLERY_FILTER_TABS.IDS}>
                    <CmsSettingsChips
                      entries={ids || []}
                      handleUpdate={handleUpdate}
                      property={GALLERY_FILTER_TABS.IDS}
                    />
                  </Tabs.Content>
                  <Tabs.Content value={GALLERY_FILTER_TABS.TAGS}>
                    <CmsSettingsChips
                      entries={tags || []}
                      handleUpdate={handleUpdate}
                      property={GALLERY_FILTER_TABS.TAGS}
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
