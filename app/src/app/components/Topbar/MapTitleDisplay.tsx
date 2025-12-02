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
  Popover,
} from '@radix-ui/themes';
import {useEffect, useState} from 'react';
import {MAX_TITLE_LENGTH} from '@/app/utils/language';
import {
  DocumentMetadata,
  DocumentObject,
  type DraftStatus,
} from '@/app/utils/api/apiHandlers/types';
import {Cross2Icon, Pencil1Icon} from '@radix-ui/react-icons';
import {MapContextModuleAndUnits} from './MapContextModuleAndUnits';
import {InProgressIcon, ReadyIcon, ScratchWorkIcon} from './Icons';
import {SegmentedControl} from '@radix-ui/themes';

const statusIcons: Record<DraftStatus, React.FC> = {
  scratch: ScratchWorkIcon,
  in_progress: InProgressIcon,
  ready_to_share: ReadyIcon,
};

const statusText: Record<DraftStatus, string> = {
  scratch: 'Scratch Work',
  in_progress: 'In Progress',
  ready_to_share: 'Ready to Share',
};

const iconOrder: DraftStatus[] = ['scratch', 'in_progress', 'ready_to_share'];

export const MapTitleDisplay: React.FC<{
  mapMetadata: DocumentMetadata | null;
  mapDocument: DocumentObject | null;
  handleMetadataChange: (updates: Partial<DocumentMetadata>) => Promise<void>;
}> = ({mapMetadata, mapDocument, handleMetadataChange}) => {
  const [mapTitleInner, setMapTitleInner] = useState<string>('');
  const [hovered, setHovered] = useState(false);
  const [mapDescriptionInner, setMapDescriptionInner] = useState<string>('');
  const [mapStatusInner, setMapStatusInner] = useState<DraftStatus>('scratch');
  const [open, setOpen] = useState(false);

  const _mapName = mapMetadata?.name ?? mapDocument?.map_metadata?.name ?? '';
  const _mapDescription = mapMetadata?.description ?? mapDocument?.map_metadata?.description ?? '';

  const isTruncated = _mapName.length > MAX_TITLE_LENGTH;
  const mapName = isTruncated ? `${_mapName.slice(0, MAX_TITLE_LENGTH)}...` : _mapName;
  const editing = mapDocument?.document_id !== 'anonymous';

  const draftStatus = mapMetadata?.draft_status ?? 'scratch';
  const DraftStatusIcon = statusIcons[draftStatus] ?? ScratchWorkIcon;

  useEffect(() => {
    setMapTitleInner(_mapName);
    setMapDescriptionInner(_mapDescription ?? '');
    setMapStatusInner(draftStatus);
  }, [_mapName, _mapDescription, draftStatus]);

  if (!mapMetadata && !mapDocument) {
    return null;
  }

  // If not editing, just show text or truncated text with tooltip
  if (!editing && !isTruncated) {
    return <Text size="2">{mapName}</Text>;
  }

  if (!editing && isTruncated) {
    return (
      <Tooltip content={_mapName}>
        <Flex align="center" gapX="1" direction="row">
          <Text size="2">{mapName}</Text>
        </Flex>
      </Tooltip>
    );
  }

  // If editing, show popover hint, open dialog for editing on click
  if (editing) {
    return (
      <>
        <Popover.Root open={hovered}>
          <Popover.Trigger
            onClick={() => setOpen(true)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <Button variant="ghost" color="gray" className="cursor-pointer">
              <Flex
                align="center"
                gapX="1"
                direction="row"
                className="cursor-pointer"
                onClick={() => setOpen(true)}
                tabIndex={0}
                style={{outline: 'none'}}
                aria-label="Edit map name and metadata"
              >
                <DraftStatusIcon />
                {!!mapName && (
                  <Text size="2" className="font-bold text-black">
                    {mapName || '(Edit map name)'}
                  </Text>
                )}
                <MapContextModuleAndUnits />
                {editing ? <Pencil1Icon /> : null}
              </Flex>
            </Button>
          </Popover.Trigger>
          <Popover.Content align="center" className="w-full">
            <Flex direction="row" gap="2" align="center" justify="center">
              <Text size="1" className="text-center">
                Click to edit map name and metadata
              </Text>
            </Flex>
          </Popover.Content>
        </Popover.Root>

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
              <Dialog.Title>Edit Map Name & Metadata</Dialog.Title>
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

              <SegmentedControl.Root
                value={mapStatusInner}
                onValueChange={e => setMapStatusInner(e as DraftStatus)}
                size="1"
                className="w-full h-full mb-4"
                style={{width: '100%', maxWidth: '100%'}}
              >
                {iconOrder.map(status => (
                  <SegmentedControl.Item key={status} value={status}>
                    <Flex
                      direction="column"
                      gap="0"
                      align="center"
                      justify="start"
                      className="py-1"
                    >
                      {statusIcons[status]({})}
                      <Text>{statusText[status]}</Text>
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
