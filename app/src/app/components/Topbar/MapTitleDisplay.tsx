'use client';
import {
  Button,
  Text,
  Flex,
  Tooltip,
  Dialog,
  TextField,
  TextArea,
  Box,
  IconButton,
} from '@radix-ui/themes';
import {useEffect, useState} from 'react';
import {MAX_TITLE_LENGTH} from '@/app/utils/language';
import {DocumentMetadata, DocumentObject} from '@/app/utils/api/apiHandlers/types';
import {
  DRAFT_STATUSES,
  type DraftStatus,
  DRAFT_STATUS_TEXT,
  DRAFT_STATUS_ORDER,
} from '@constants/document/draftStatus';
import {Cross2Icon, Pencil1Icon} from '@radix-ui/react-icons';
import {useMapModuleInfo} from './MapContextModuleAndUnits';
import {InProgressIcon, ReadyIcon, ScratchWorkIcon} from './Icons';
import {SegmentedControl} from '@radix-ui/themes';
import {ANONYMOUS_DOCUMENT_ID} from '@/app/constants/document/limits';

const statusIcons: Record<DraftStatus, React.FC> = {
  [DRAFT_STATUSES.SCRATCH]: ScratchWorkIcon,
  [DRAFT_STATUSES.IN_PROGRESS]: InProgressIcon,
  [DRAFT_STATUSES.READY_TO_SHARE]: ReadyIcon,
};

export const MapTitleDisplay: React.FC<{
  mapMetadata: DocumentMetadata | null;
  mapDocument: DocumentObject | null;
  handleMetadataChange: (updates: Partial<DocumentMetadata>) => Promise<void>;
}> = ({mapMetadata, mapDocument, handleMetadataChange}) => {
  const [mapTitleInner, setMapTitleInner] = useState<string>('');
  const [mapDescriptionInner, setMapDescriptionInner] = useState<string>('');
  const [mapStatusInner, setMapStatusInner] = useState<DraftStatus>(DRAFT_STATUSES.SCRATCH);
  const [open, setOpen] = useState(false);
  const {moduleName, unitsSentence, dataSourceSentence} = useMapModuleInfo();

  const _mapName = mapMetadata?.name ?? mapDocument?.map_metadata?.name ?? '';
  const _mapDescription = mapMetadata?.description ?? mapDocument?.map_metadata?.description ?? '';

  const isTruncated = _mapName.length > MAX_TITLE_LENGTH;
  const mapName = isTruncated ? `${_mapName.slice(0, MAX_TITLE_LENGTH)}...` : _mapName;
  const editing = mapDocument?.document_id !== ANONYMOUS_DOCUMENT_ID;

  const draftStatus = mapMetadata?.draft_status ?? DRAFT_STATUSES.SCRATCH;
  const DraftStatusIcon = statusIcons[draftStatus];

  // The module shows inline until the map is named, then moves into the
  // hover — one condensed tooltip instead of stacked popover + tooltip.
  const displayTitle = mapName || moduleName;
  const tooltipContent = [
    isTruncated ? _mapName + '.' : null,
    mapName ? moduleName + '.' : null,
    dataSourceSentence,
    unitsSentence,
    editing ? 'Click to edit the map name and details.' : null,
  ]
    .filter(Boolean)
    .join(' ');

  useEffect(() => {
    setMapTitleInner(_mapName);
    setMapDescriptionInner(_mapDescription ?? '');
    setMapStatusInner(draftStatus);
  }, [_mapName, _mapDescription, draftStatus]);

  if (!mapMetadata && !mapDocument) {
    return null;
  }

  // If not editing, just show the name (or module) with one combined tooltip
  if (!editing) {
    const display = (
      <Flex align="center" gapX="1" direction="row">
        <DraftStatusIcon />
        <Text size="2" className={mapName ? '' : 'text-gray-500'}>
          {displayTitle}
        </Text>
      </Flex>
    );
    return tooltipContent ? <Tooltip content={tooltipContent}>{display}</Tooltip> : display;
  }

  // If editing, one condensed tooltip (edit hint + module/unit info); click
  // opens the edit dialog.
  if (editing) {
    return (
      <>
        <Tooltip content={tooltipContent}>
          <Button
            variant="ghost"
            color="gray"
            className="cursor-pointer"
            onClick={() => setOpen(true)}
            aria-label="Edit map name and information"
          >
            <Flex align="center" gapX="1" direction="row">
              <DraftStatusIcon />
              <Text size="2" className={mapName ? 'font-bold text-black' : 'text-gray-500'}>
                {displayTitle || '(Edit map name)'}
              </Text>
              <Pencil1Icon />
            </Flex>
          </Button>
        </Tooltip>

        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Content style={{maxWidth: 400}}>
            <Box className="size-full relative">
              <IconButton
                className="!absolute !top-0 !right-0"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                <Cross2Icon />
              </IconButton>
              <Dialog.Title>Edit Map Name and Information</Dialog.Title>
              <Box mb="3">
                <Text as="label" size="2" htmlFor="map-title" mb="1">
                  Map Name
                </Text>
                <TextField.Root
                  id="map-title"
                  value={mapTitleInner}
                  placeholder="Map name"
                  onChange={e => setMapTitleInner(e.target.value)}
                  className="w-full"
                  mt="1"
                >
                  <TextField.Slot>
                    <Pencil1Icon />
                  </TextField.Slot>
                </TextField.Root>
              </Box>
              <Box mb="3">
                <Text as="label" size="2" htmlFor="map-desc" mb="1">
                  Description (optional)
                </Text>
                <TextArea
                  id="map-desc"
                  value={mapDescriptionInner ?? ''}
                  placeholder="Description (optional)"
                  rows={3}
                  onChange={e => setMapDescriptionInner(e.target.value)}
                  className="w-full"
                  mt="1"
                />
              </Box>

              <Text as="label" size="2" htmlFor="map-desc" mb="1">
                Draft status
              </Text>
              <SegmentedControl.Root
                value={mapStatusInner}
                onValueChange={e => setMapStatusInner(e as DraftStatus)}
                size="1"
                className="w-full h-full mb-4"
                style={{width: '100%', maxWidth: '100%'}}
              >
                {DRAFT_STATUS_ORDER.map(status => (
                  <SegmentedControl.Item key={status} value={status}>
                    <Flex
                      direction="column"
                      gap="0"
                      align="center"
                      justify="start"
                      className="py-1"
                    >
                      {statusIcons[status]({})}
                      <Text>{DRAFT_STATUS_TEXT[status]}</Text>
                    </Flex>
                  </SegmentedControl.Item>
                ))}
              </SegmentedControl.Root>
              <Flex direction="row" gap="2" justify="end">
                <Button
                  size="1"
                  variant="outline"
                  color="gray"
                  onClick={() => {
                    setMapTitleInner(_mapName);
                    setMapDescriptionInner(_mapDescription ?? '');
                    setOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="1"
                  variant="solid"
                  color="green"
                  type="submit"
                  onClick={async () => {
                    await handleMetadataChange({
                      name: mapTitleInner,
                      description: mapDescriptionInner,
                      draft_status: mapStatusInner,
                    });
                    setOpen(false);
                  }}
                >
                  Save
                </Button>
              </Flex>
            </Box>
          </Dialog.Content>
        </Dialog.Root>
      </>
    );
  }

  return null;
};
