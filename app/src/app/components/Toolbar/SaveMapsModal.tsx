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
  nameIsSaved: boolean;
  setNameIsSaved: (value: boolean) => void;
  open?: boolean;
  onClose?: () => void;
  showTrigger?: boolean;
}> = ({open, onClose, showTrigger, nameIsSaved, setNameIsSaved}) => {
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
  const [groupName, setGroupName] = React.useState<string | undefined | null>(
    currentMapMetadata?.group
  );
  const [mapDescription, setMapDescription] = React.useState<string | undefined | null>(
    currentMapMetadata?.description
  );
  const [mapIsDraft, setMapIsDraft] = React.useState<boolean | undefined | null>(
    currentMapMetadata?.is_draft
  );

  const [mapTags, setTags] = React.useState<string | undefined | null>(currentMapMetadata?.tags);
  const [groupNameIsSaved, setGroupNameIsSaved] = React.useState(false);
  const [tagsIsSaved, setTagsIsSaved] = React.useState(false);
  const [descriptionIsSaved, setDescriptionIsSaved] = React.useState(false);
  const [shareStateIsSaved, setShareStateIsSaved] = React.useState(false);

  React.useEffect(() => {
    setGroupName(groupName);
    setTags(mapTags);
  }, [groupName, mapTags, dialogOpen]);

  const handleChangeGroupName = (name: string | null) => {
    // if name does not match metadata, make eligible to save
    if (name !== groupName && name !== null) {
      setGroupNameIsSaved(false);
      setGroupName(name);
    }
  };

  useEffect(() => {
    if (dialogOpen && initialMetadataRef.current === null) {
      initialMetadataRef.current = currentMapMetadata ?? null;
      setGroupName(currentMapMetadata?.name);
      setTags(currentMapMetadata?.tags);
      setMapDescription(currentMapMetadata?.description);
      setMapIsDraft(currentMapMetadata?.is_draft);
    }
  }, [currentMapMetadata, dialogOpen]);

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

  const handleChangeIsDraft = (isDraft: boolean) => {
    setMapIsDraft(isDraft);
    setShareStateIsSaved(false);
  };

  const handleMetadataChange = (key: keyof DocumentMetadata, value: any) => {
    if (mapDocument?.document_id) {
      switch (key) {
        case 'group':
          handleChangeGroupName(value);
          break;
        case 'tags':
          handleChangeTag(value);
          break;
        case 'description':
          handleChangeDescription(value);
          break;
        case 'is_draft':
          handleChangeIsDraft(value);
          break;
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
    setGroupNameIsSaved(true);
    setTagsIsSaved(true);
    setNameIsSaved(true);
    setDescriptionIsSaved(true);
    setShareStateIsSaved(true);
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
        <Flex gap="2" width={'100%'} display={'flex'}>
          <Box width={'33%'}>
            <Text as="label" size="2">
              Comments
            </Text>
            <TextArea
              placeholder={'Comments'}
              size="3"
              value={mapDescription ?? undefined}
              onChange={e => handleMetadataChange('description', e.target.value)}
            ></TextArea>
          </Box>
          <Box width={'33%'}>
            {mapDocument?.status && mapDocument?.status === 'locked' ? (
              <Text>Name your Copy </Text>
            ) : (
              <Text>Group Name</Text>
            )}
            <TextField.Root
              placeholder={groupName ?? 'Group Name'}
              size="3"
              value={groupName ?? undefined}
              onChange={e => handleMetadataChange('group', e.target.value)}
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

          <Box width={'33%'}>
            <Flex gap="2">
              <RadioGroup.Root
                value={mapIsDraft ? 'draft' : 'share'}
                onValueChange={value => {
                  handleMetadataChange('is_draft', value === 'draft');
                }}
              >
                <RadioGroup.Item value="share">Ready to Share</RadioGroup.Item>
                <RadioGroup.Item value="draft">In Progress (Draft)</RadioGroup.Item>
              </RadioGroup.Root>
            </Flex>
          </Box>
        </Flex>
        {/* save map */}
        <Button
          variant="solid"
          className="flex items-center "
          onClick={handleMapSave}
          disabled={
            nameIsSaved &&
            tagsIsSaved &&
            descriptionIsSaved &&
            groupNameIsSaved &&
            shareStateIsSaved
          }
        >
          {mapDocument.status !== 'locked' &&
          nameIsSaved &&
          tagsIsSaved &&
          descriptionIsSaved &&
          groupNameIsSaved &&
          shareStateIsSaved
            ? 'Saved!'
            : mapDocument.status === 'locked'
              ? 'Create Copy'
              : 'Save'}
        </Button>
      </BoxContainer>
    </>
  );
};
