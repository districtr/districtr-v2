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
import {DocumentMetadata} from '../../utils/api/apiHandlers';
import {styled} from '@stitches/react';
import {metadata, document} from '@/app/utils/api/mutations';

const DialogContentContainer = styled(Dialog.Content);

const BoxContainer = styled(Box, {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
});

export const SaveMapDetails: React.FC<{}> = ({}) => {
  const mapDocument = useMapStore(store => store.mapDocument);
  const setMapDocument = useMapStore(store => store.setMapDocument);
  const gerryDBTable = mapDocument?.gerrydb_table;
  const userMaps = useMapStore(store => store.userMaps);
  const upsertUserMap = useMapStore(store => store.upsertUserMap);

  const initialMetadataRef = React.useRef<DocumentMetadata | null>(null);

  const currentMapMetadata = React.useMemo(
    () => userMaps.find(map => map.document_id === mapDocument?.document_id)?.map_metadata,
    [mapDocument?.document_id, userMaps]
  );

  const [mapName, setMapName] = React.useState<string | undefined | null>(currentMapMetadata?.name);
  const [groupName, setGroupName] = React.useState<string | undefined | null>(
    currentMapMetadata?.group
  );
  const [mapDescription, setMapDescription] = React.useState<string | undefined | null>(
    currentMapMetadata?.description
  );
  const [mapIsDraft, setMapIsDraft] = React.useState<string | undefined | null>(
    currentMapMetadata?.is_draft ? 'draft' : 'share'
  );
  const [mapTags, setTags] = React.useState<string | undefined | null>(currentMapMetadata?.tags);
  const [mapNameIsSaved, setMapNameIsSaved] = React.useState(false);
  const [groupNameIsSaved, setGroupNameIsSaved] = React.useState(false);
  const [tagsIsSaved, setTagsIsSaved] = React.useState(false);
  const [descriptionIsSaved, setDescriptionIsSaved] = React.useState(false);
  const [shareStateIsSaved, setShareStateIsSaved] = React.useState(false);

  const [latestMetadata, setLatestMetadata] = React.useState<DocumentMetadata | null>(null);

  useEffect(() => {
    const metadata = userMaps.find(
      map => map.document_id === mapDocument?.document_id
    )?.map_metadata;
    if (metadata) {
      setLatestMetadata(metadata);
    }
  }, [mapDocument?.document_id, userMaps]);

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
    if (isDraft === 'draft') {
      setMapIsDraft(true);
    }
    if (isDraft === 'share') {
      setMapIsDraft(false);
    }
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
      is_draft: handleChangeIsDraft,
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
    if (mapDocument?.document_id) {
      if (!latestMetadata) {
        return;
      }
      console.log('latestMetadata', latestMetadata);
      if (mapDocument?.status === 'locked') {
        document
          .mutate({
            gerrydb_table: mapDocument?.gerrydb_table,
            metadata: latestMetadata,
            user_id: useMapStore.getState().userID,
            copy_from_doc: mapDocument?.document_id,
          })
          .then(data => {
            metadata.mutate({
              document_id: data.document_id,
              metadata: latestMetadata,
            });
            upsertUserMap({
              documentId: data.document_id,
              mapDocument: {
                ...data,
                map_metadata: latestMetadata,
              },
            });
            data.map_metadata = latestMetadata;
            setMapDocument(data);
          });
      } else {
        metadata.mutate({
          document_id: mapDocument?.document_id,
          metadata: latestMetadata,
        });
        upsertUserMap({
          documentId: mapDocument?.document_id,
          mapDocument: {
            ...mapDocument,
            map_metadata: latestMetadata,
          },
        });
      }
    }

    setGroupNameIsSaved(true);
    setTagsIsSaved(true);
    setDescriptionIsSaved(true);
    setShareStateIsSaved(true);
    setMapNameIsSaved(true);
  };

  // if no gerrydb table selected return null
  if (!gerryDBTable) {
    return <div></div>;
  }

  return (
    <>
      <BoxContainer>
        <Flex gap="4" width={'100%'} display={'flex'}>
          <Box width={'25%'}>
            {/* map status */}
            <Text weight={'medium'}> Map Status </Text>
            <Flex gap="2">
              <RadioGroup.Root
                value={mapIsDraft}
                onValueChange={value => {
                  handleMetadataChange('is_draft', value === 'draft');
                }}
              >
                <RadioGroup.Item value="share">Ready to Share</RadioGroup.Item>
                <RadioGroup.Item value="draft">In Progress (Draft)</RadioGroup.Item>
              </RadioGroup.Root>
            </Flex>
          </Box>
          <Box width={'25%'}>
            {/* map name */}
            {mapDocument?.status && mapDocument?.status === 'locked' ? (
              <Text>Name your Copy </Text>
            ) : (
              <Text>Map Name</Text>
            )}
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
        <Button
          variant="solid"
          className="flex items-center "
          onClick={handleMapSave}
          disabled={
            tagsIsSaved &&
            descriptionIsSaved &&
            groupNameIsSaved &&
            shareStateIsSaved &&
            mapNameIsSaved
          }
        >
          {mapDocument.status !== 'locked' &&
          tagsIsSaved &&
          descriptionIsSaved &&
          groupNameIsSaved &&
          shareStateIsSaved &&
          mapNameIsSaved
            ? 'Saved!'
            : mapDocument.status === 'locked'
              ? 'Create Copy'
              : 'Save'}
        </Button>
      </BoxContainer>
    </>
  );
};
