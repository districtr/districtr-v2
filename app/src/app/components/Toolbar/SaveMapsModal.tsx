import {useMapStore} from '@/app/store/mapStore';
import React, {useEffect} from 'react';
import {
  Button,
  Flex,
  Text,
  Table,
  Dialog,
  Box,
  TextField,
  Checkbox,
  IconButton,
  RadioCards,
  RadioGroup,
  TextArea,
} from '@radix-ui/themes';
import {DocumentMetadata, DocumentObject} from '../../utils/api/apiHandlers';
import {styled} from '@stitches/react';
import {metadata, document} from '@/app/utils/api/mutations';

const DialogContentContainer = styled(Dialog.Content);

const BoxContainer = styled(Box, {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
});

export const SaveMapDetails: React.FC<{
  open?: boolean;
  onClose?: () => void;
  showTrigger?: boolean;
}> = ({open, onClose, showTrigger}) => {
  const mapDocument = useMapStore(store => store.mapDocument);
  const setMapDocument = useMapStore(store => store.setMapDocument);
  const gerryDBTable = mapDocument?.gerrydb_table;
  const userMaps = useMapStore(store => store.userMaps);
  const upsertUserMap = useMapStore(store => store.upsertUserMap);
  const [dialogOpen, setDialogOpen] = React.useState(open || false);

  useEffect(() => {
    setDialogOpen(open || false);
  }, [open]);

  const initialMetadataRef = React.useRef<DocumentMetadata | null>(null);

  const currentMapMetadata = React.useMemo(
    () => userMaps.find(map => map.document_id === mapDocument?.document_id)?.map_metadata,
    [mapDocument?.document_id, userMaps]
  );
  const [mapName, setMapName] = React.useState<string | undefined | null>(currentMapMetadata?.name);
  const [mapTags, setTags] = React.useState<string | undefined | null>(currentMapMetadata?.tags);
  const [nameIsSaved, setNameIsSaved] = React.useState(false);
  const [tagsIsSaved, setTagsIsSaved] = React.useState(false);

  React.useEffect(() => {
    setMapName(mapName);
    setTags(mapTags);
  }, [mapName, mapTags, dialogOpen]);

  const handleChangeName = (name: string | null) => {
    // if name does not match metadata, make eligible to save
    if (name !== mapName && name !== null) {
      setNameIsSaved(false);
      setMapName(name);
    }
  };

  useEffect(() => {
    if (dialogOpen && initialMetadataRef.current === null) {
      initialMetadataRef.current = currentMapMetadata ?? null;
      setMapName(currentMapMetadata?.name);
      setTags(currentMapMetadata?.tags);
    }
  }, [currentMapMetadata, dialogOpen]);

  const handleChangeTag = (tag: string | null) => {
    if (tag && mapTags && !mapTags.includes(tag)) {
      setTagsIsSaved(false);
    }
  };

  const handleMetadataChange = (key: keyof DocumentMetadata, value: any) => {
    if (mapDocument?.document_id) {
      if (key === 'name') {
        handleChangeName(value);
      } else if (key === 'tags') {
        handleChangeTag(value);
      }
      upsertUserMap({
        documentId: mapDocument?.document_id,
        mapDocument: {
          ...mapDocument,
          map_metadata: {
            ...mapDocument.map_metadata,
            [key]: value ?? null,
          },
        },
      });
    }
  };

  const handleMapSave = () => {
    console.log('saving map');
    if (mapDocument?.document_id) {
      const savedMapMetadata = userMaps.find(
        map => map.document_id === mapDocument?.document_id
      )?.map_metadata;
      if (!savedMapMetadata) {
        return;
      }
      if (mapDocument?.status === 'locked') {
        // if you have a locked map, save a copy
        document
          .mutate({
            gerrydb_table: mapDocument?.gerrydb_table,
            metadata: savedMapMetadata,
            user_id: useMapStore.getState().userID,
            copy_from_doc: mapDocument?.document_id,
          })
          .then(data => {
            // update in db
            metadata.mutate({
              document_id: data.document_id,
              metadata: savedMapMetadata,
            });
            // update in usermaps
            upsertUserMap({
              documentId: data.document_id,
              mapDocument: {
                ...data,
                map_metadata: savedMapMetadata,
              },
            });
            // swap out current map with newly copied one
            data.map_metadata = savedMapMetadata;
            setMapDocument(data);
          });
      } else {
        // otherwise just update
        metadata.mutate({
          document_id: mapDocument?.document_id,
          metadata: savedMapMetadata,
        });
        upsertUserMap({
          documentId: mapDocument?.document_id,
          mapDocument: {
            ...mapDocument,
            map_metadata: savedMapMetadata,
          },
        });
      }
    }
    setNameIsSaved(true);
    setTagsIsSaved(true);
  };

  useEffect(() => {
    if (!dialogOpen) {
      onClose?.();
    }
  }, [dialogOpen]);

  // if no gerrydb table selected return null
  if (!gerryDBTable) {
    return <div></div>;
  }

  return (
    <>
      <BoxContainer>
        <Flex css={{justifyContent: 'space-between'}} gap={'5'}>
          <Box maxWidth="200px" width={'33%'}>
            <Text as="label" size="2">
              Comments
            </Text>
            <TextArea
              placeholder={'Comments'}
              size="3"
              onChange={e => handleMetadataChange('comments', e.target.value)}
            ></TextArea>
          </Box>
          <Box maxWidth="200px" width={'33%'}>
            {mapDocument?.status && mapDocument?.status === 'locked' ? (
              <Text>Name your Copy </Text>
            ) : (
              <Text>Group Name</Text>
            )}
            <TextField.Root
              placeholder={mapName ?? 'Plan Name'}
              size="3"
              value={mapName ?? undefined}
              onChange={e => handleMetadataChange('name', e.target.value)}
            ></TextField.Root>

            <Text>Tags</Text>
            <TextField.Root
              placeholder={'Tags'}
              size="3"
              value={mapTags ?? ''}
              disabled
              onChange={e => handleMetadataChange('tags', e.target.value)}
            ></TextField.Root>
          </Box>

          <Box>
            <Flex gap="2">
              <RadioGroup.Root>
                <RadioGroup.Item value="share">Share with Team (coming soon) </RadioGroup.Item>
                <RadioGroup.Item value="draft"> Save as Draft (coming soon) </RadioGroup.Item>
              </RadioGroup.Root>
            </Flex>
          </Box>
        </Flex>
        {/* save map */}
        <Button
          variant="soft"
          className="flex items-center "
          onClick={handleMapSave}
          disabled={nameIsSaved && tagsIsSaved}
        >
          {mapDocument.status !== 'locked' && nameIsSaved && tagsIsSaved
            ? 'Saved!'
            : mapDocument.status === 'locked'
              ? 'Create Copy'
              : 'Save'}
        </Button>
      </BoxContainer>
    </>
  );
};
