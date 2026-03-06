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
import {PlanGallery, PlanGalleryProps} from './PlanGallery';
import {GearIcon, TrashIcon} from '@radix-ui/react-icons';
import {NoFocusBoundary} from '../NoFocusBoundary';
import {CmsSettingsChips} from '../EditHelpers/CmsSettingsChips';
import {
  GALLERY_FILTER_TABS,
  PLAN_GALLERY_ATTRS,
  PLAN_GALLERY_DISPLAY_OPTIONS,
  type PlanGalleryDisplayOptionKey,
} from '@constants/cms/richText';

const PlanGalleryNodeView: React.FC<NodeViewProps> = ({node, updateAttributes, deleteNode}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  // Use a nested editor for the custom content
  const ids: number[] | undefined = node.attrs[PLAN_GALLERY_ATTRS.IDS] || undefined;
  const tags: string[] | undefined = node.attrs[PLAN_GALLERY_ATTRS.TAGS] || undefined;
  const title: string | undefined = node.attrs[PLAN_GALLERY_ATTRS.TITLE] || undefined;
  const description: string | undefined = node.attrs[PLAN_GALLERY_ATTRS.DESCRIPTION] || undefined;
  const paginate: string | undefined = node.attrs[PLAN_GALLERY_ATTRS.PAGINATE] || undefined;
  const limit: number | undefined = node.attrs[PLAN_GALLERY_ATTRS.LIMIT] || undefined;
  const showListView: boolean | undefined =
    node.attrs[PLAN_GALLERY_ATTRS.SHOW_LIST_VIEW] || undefined;
  const showThumbnails: boolean | undefined =
    node.attrs[PLAN_GALLERY_ATTRS.SHOW_THUMBNAILS] || undefined;
  const showTitles: boolean | undefined = node.attrs[PLAN_GALLERY_ATTRS.SHOW_TITLES] || undefined;
  const showDescriptions: boolean | undefined =
    node.attrs[PLAN_GALLERY_ATTRS.SHOW_DESCRIPTIONS] || undefined;
  const showUpdatedAt: boolean | undefined =
    node.attrs[PLAN_GALLERY_ATTRS.SHOW_UPDATED_AT] || undefined;
  const showTags: boolean | undefined = node.attrs[PLAN_GALLERY_ATTRS.SHOW_TAGS] || undefined;
  const showModule: boolean | undefined = node.attrs[PLAN_GALLERY_ATTRS.SHOW_MODULE] || undefined;

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const handleUpdate = (updates: Partial<PlanGalleryProps>) => {
    const newAttrs = {
      ...node.attrs,
      ...updates,
    };
    updateAttributes(newAttrs);
  };

  const displayOptionState: Record<PlanGalleryDisplayOptionKey, boolean> = {
    [PLAN_GALLERY_ATTRS.PAGINATE]: Boolean(paginate),
    [PLAN_GALLERY_ATTRS.SHOW_LIST_VIEW]: Boolean(showListView),
    [PLAN_GALLERY_ATTRS.SHOW_THUMBNAILS]: Boolean(showThumbnails),
    [PLAN_GALLERY_ATTRS.SHOW_TITLES]: Boolean(showTitles),
    [PLAN_GALLERY_ATTRS.SHOW_DESCRIPTIONS]: Boolean(showDescriptions),
    [PLAN_GALLERY_ATTRS.SHOW_UPDATED_AT]: Boolean(showUpdatedAt),
    [PLAN_GALLERY_ATTRS.SHOW_TAGS]: Boolean(showTags),
    [PLAN_GALLERY_ATTRS.SHOW_MODULE]: Boolean(showModule),
  };

  const selectedDisplayOptions = PLAN_GALLERY_DISPLAY_OPTIONS.filter(option => {
    return displayOptionState[option.key];
  }).map(option => option.key);

  return (
    <NodeViewWrapper
      className="relative border-[1px] border-blue-500 my-4 rounded-md border-dashed"
      ref={parentRef}
      contentEditable={false}
    >
      <NoFocusBoundary parentRef={parentRef}>
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
                    value={selectedDisplayOptions}
                    onValueChange={value => {
                      const selectedValues = new Set(value);
                      handleUpdate({
                        paginate: selectedValues.has(PLAN_GALLERY_ATTRS.PAGINATE),
                        showListView: selectedValues.has(PLAN_GALLERY_ATTRS.SHOW_LIST_VIEW),
                        showThumbnails: selectedValues.has(PLAN_GALLERY_ATTRS.SHOW_THUMBNAILS),
                        showTitles: selectedValues.has(PLAN_GALLERY_ATTRS.SHOW_TITLES),
                        showDescriptions: selectedValues.has(PLAN_GALLERY_ATTRS.SHOW_DESCRIPTIONS),
                        showUpdatedAt: selectedValues.has(PLAN_GALLERY_ATTRS.SHOW_UPDATED_AT),
                        showTags: selectedValues.has(PLAN_GALLERY_ATTRS.SHOW_TAGS),
                        showModule: selectedValues.has(PLAN_GALLERY_ATTRS.SHOW_MODULE),
                      });
                    }}
                  >
                    {PLAN_GALLERY_DISPLAY_OPTIONS.map(option => (
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
