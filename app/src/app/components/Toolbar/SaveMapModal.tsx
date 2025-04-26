import {useMapStore} from '@/app/store/mapStore';
import React, {useMemo, useEffect} from 'react';
import {
  Button,
  Flex,
  Text,
  Box,
  TextField,
  RadioGroup,
  TextArea,
  Blockquote,
  Dialog,
} from '@radix-ui/themes';
import {Cross2Icon} from '@radix-ui/react-icons';
import type {DocumentMetadata} from '../../utils/api/apiHandlers/types';
import {styled} from '@stitches/react';
import {checkoutDocument} from '@/app/utils/api/mutations';
import {saveMap} from '@/app/utils/api/apiHandlers/saveMap';
import {useMapStatus} from '@/app/hooks/useMapStatus';

const BoxContainer = styled(Box, {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
});

const DialogContentContainer = styled(Dialog.Content, {
  maxHeight: 'calc(100vh-2rem)',
  maxWidth: '60vw',
  overflowY: 'auto',
});

export const SaveMapModal: React.FC<{
  open?: boolean;
  onClose?: () => void;
  showTrigger?: boolean;
}> = ({open, onClose, showTrigger}) => {
  const [dialogOpen, setDialogOpen] = React.useState(open || false);
  useEffect(() => {
    setDialogOpen(open || false);
  }, [open]);

  const mapDocument = useMapStore(store => store.mapDocument);
  const status = useMapStore(store => store.mapStatus?.status);
  const userMaps = useMapStore(store => store.userMaps);
  const upsertUserMap = useMapStore(store => store.upsertUserMap);
  const [mapName, setMapName] = React.useState<string | null>(null);
  const [groupName, setGroupName] = React.useState<string | null>(null);
  const [mapDescription, setMapDescription] = React.useState<string | null>(null);
  const [mapIsDraft, setMapIsDraft] = React.useState<string | null>(null);
  const [mapTags, setTags] = React.useState<string | null>(null);
  const [mapNameIsSaved, setMapNameIsSaved] = React.useState(false);
  const [groupNameIsSaved, setGroupNameIsSaved] = React.useState(false);
  const [tagsIsSaved, setTagsIsSaved] = React.useState(false);
  const [descriptionIsSaved, setDescriptionIsSaved] = React.useState(false);
  const [shareStateIsSaved, setShareStateIsSaved] = React.useState(false);
  const [password, setPassword] = React.useState<string | null>(null);
  const receivedShareToken = useMapStore(store => store.receivedShareToken ?? '');
  const shareMapMessage = useMapStore(store => store.shareMapMessage);
  const {frozenMessage} = useMapStatus();
  const mapIsSaved =
    tagsIsSaved && descriptionIsSaved && groupNameIsSaved && shareStateIsSaved && mapNameIsSaved;

  const latestMetadata = useMemo(() => {
    const metadata = userMaps.find(
      map => map.document_id === mapDocument?.document_id
    )?.map_metadata;
    return metadata ?? null;
  }, [mapDocument?.document_id, userMaps]);

  useEffect(() => {
    if (!mapDocument) return;

    const metadata =
      userMaps.find(map => map.document_id === mapDocument.document_id)?.map_metadata ??
      mapDocument.map_metadata;

    setMapName(metadata?.name ?? null);
    setGroupName(metadata?.group ?? null);
    setMapDescription(metadata?.description ?? null);
    setMapIsDraft(metadata?.draft_status ?? null);
    setTags(metadata?.tags ?? null);
  }, [mapDocument, userMaps]);

  const handlePasswordSubmit = async () => {
    if (mapDocument?.document_id && receivedShareToken.length) {
      checkoutDocument
        .mutate({
          document_id: mapDocument.document_id,
          token: receivedShareToken,
          password: password ?? '',
        }) // error is handled in the mutation observser
        .catch(() => null);
    }
  };

  const handleChangeGroupName = (name: string | null) => {
    // if name does not match metadata, make eligible to save
    if (name !== groupName && name !== null) {
      setGroupNameIsSaved(false);
      setGroupName(name);
    }
  };

  const handleChangeTag = (tag: string | null) => {
    if (tag && mapTags && !mapTags.includes(tag)) {
      setTagsIsSaved(false);
    }
  };

  const handleChangeDescription = (description: string | null) => {
    if (description !== mapDescription && description !== null) {
      setMapDescription(description);
      setDescriptionIsSaved(false);
    }
  };

  const handleChangeIsDraft = (isDraft: string) => {
    setMapIsDraft(isDraft);
    setShareStateIsSaved(false);
  };

  const handleChangeMapName = (name: string | null) => {
    if (name !== mapName && name !== null) {
      setMapName(name);
      setMapNameIsSaved(false);
    }
  };

  const handleMetadataChange: (key: keyof DocumentMetadata, value: any) => void = (key, value) => {
    if (!mapDocument?.document_id) return;

    const handlers: Partial<Record<keyof DocumentMetadata, (val: any) => void>> = {
      name: handleChangeMapName,
      group: handleChangeGroupName,
      tags: handleChangeTag,
      description: handleChangeDescription,
      draft_status: handleChangeIsDraft,
    };

    handlers[key]?.(value);
    upsertUserMap({
      documentId: mapDocument.document_id,
      mapDocument: {
        ...mapDocument,
        map_metadata: {
          ...(latestMetadata ?? mapDocument.map_metadata),
          [key]: value ?? null,
        },
      },
    });
  };

  const handleMapSave = () => {
    // TODO: confirm this is the most ergonomic way to save / store interstitial data
    saveMap(latestMetadata).then(() => {
      setGroupNameIsSaved(true);
      setTagsIsSaved(true);
      setDescriptionIsSaved(true);
      setShareStateIsSaved(true);
      setMapNameIsSaved(true);
    });
  };

  // if no document, return
  if (!mapDocument) {
    return <div></div>;
  }

  return (
    <Dialog.Root
      open={dialogOpen}
      onOpenChange={isOpen =>
        isOpen ? setDialogOpen(isOpen) : onClose ? onClose() : setDialogOpen(isOpen)
      }
    >
      {!!showTrigger && (
        <Dialog.Trigger>
          <Button variant="ghost" disabled={!userMaps.length}>
            Save / Status
          </Button>
        </Dialog.Trigger>
      )}
      <DialogContentContainer className="sm:w-[75vw] md:w-[60vw]">
        <Flex align="center" className="mb-4">
          <Dialog.Title className="m-0 text-xl font-bold flex-1">Save Map Details</Dialog.Title>

          <Dialog.Close
            className="rounded-full size-[24px] hover:bg-red-100 p-1"
            aria-label="Close"
          >
            <Cross2Icon />
          </Dialog.Close>
        </Flex>
        <BoxContainer>
          <Flex gap="4" width={'100%'} display={'flex'}>
            <Box width={'25%'}>
              {/* map status */}
              <Text weight={'medium'}> Status </Text>
              <Flex gap="2">
                <RadioGroup.Root
                  value={mapIsDraft ?? 'scratch'}
                  onValueChange={value => {
                    handleMetadataChange('draft_status', value);
                  }}
                >
                  <RadioGroup.Item value="scratch">Scratch Work Only</RadioGroup.Item>
                  <RadioGroup.Item value="in_progress">In Progress (Draft)</RadioGroup.Item>
                  <RadioGroup.Item value="ready_to_share">Ready to Share</RadioGroup.Item>
                </RadioGroup.Root>
              </Flex>
            </Box>
            <Box width={'25%'}>
              {/* map name */}
              {status === 'locked' ? <Text>Name your Copy </Text> : <Text>Map Name</Text>}
              <TextField.Root
                placeholder={mapName ?? 'Map Name'}
                size="3"
                value={mapName ?? undefined}
                onChange={e => handleMetadataChange('name', e.target.value)}
              ></TextField.Root>
              {/* group name */}
              <Text>Group Name</Text>
              <TextField.Root
                placeholder={groupName ?? 'Group Name'}
                size="3"
                value={groupName ?? undefined}
                onChange={e => handleMetadataChange('group', e.target.value)}
              ></TextField.Root>
              {/* tags */}
              <Text>Tags</Text>
              <TextField.Root
                placeholder={'Tags'}
                size="3"
                value={mapTags ?? ''}
                disabled
                onChange={e => handleMetadataChange('tags', e.target.value)}
              ></TextField.Root>
            </Box>
            <Box width={'50%'} maxHeight={'80%'} overflowY={'auto'}>
              {/* comments */}
              <Text weight={'medium'}>Comments</Text>
              <TextArea
                placeholder={'Comments'}
                size="3"
                value={mapDescription ?? undefined}
                onChange={e => handleMetadataChange('description', e.target.value)}
              ></TextArea>
            </Box>
          </Flex>
          {/* save map */}
          {/* enter password to unlock if map is locked and the access type is edit*/}
          <Flex direction="column">
            <Flex direction="row">
              <Flex gap="2">
                {useMapStore.getState().mapStatus?.status === 'locked' &&
                useMapStore.getState().mapStatus?.access === 'edit' ? (
                  <>
                    <TextField.Root
                      placeholder="Password"
                      size="3"
                      type="password"
                      value={password ?? undefined}
                      onChange={e => setPassword(e.target.value ?? null)}
                    ></TextField.Root>
                    <Flex gap="2" py="1">
                      <Button onClick={handlePasswordSubmit}>Submit</Button>
                    </Flex>
                  </>
                ) : null}
              </Flex>
              <Flex gap="2" px="2">
                {!!frozenMessage && <Text>{frozenMessage}</Text>}
              </Flex>
            </Flex>
            <Blockquote color="red">{shareMapMessage}</Blockquote>
          </Flex>

          <Button
            variant="solid"
            className="flex items-center "
            onClick={handleMapSave}
            disabled={mapIsSaved}
          >
            {status !== 'locked' && mapIsSaved
              ? 'Saved!'
              : status === 'locked'
                ? 'Create Copy'
                : 'Save'}
          </Button>
        </BoxContainer>
      </DialogContentContainer>
    </Dialog.Root>
  );
};
