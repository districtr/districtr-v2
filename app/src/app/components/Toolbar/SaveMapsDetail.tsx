import {useMapStore} from '@/app/store/mapStore';
import React, {useMemo} from 'react';
import {
  Button,
  Flex,
  Text,
  Box,
  TextField,
  RadioGroup,
  TextArea,
  Blockquote,
} from '@radix-ui/themes';
import {DocumentMetadata} from '../../utils/api/apiHandlers';
import {styled} from '@stitches/react';
import {checkoutDocument} from '@/app/utils/api/mutations';
import {saveMap} from '@/app/utils/api/apiHandlers/saveMap';
import {useMapStatus} from '@/app/hooks/useMapStatus';

const BoxContainer = styled(Box, {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
});

export const SaveMapDetails: React.FC<{}> = ({}) => {
  const mapDocument = useMapStore(store => store.mapDocument);
  const status = useMapStore(store => store.mapStatus?.status);
  const userMaps = useMapStore(store => store.userMaps);
  const upsertUserMap = useMapStore(store => store.upsertUserMap);

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
    currentMapMetadata?.is_draft === true
      ? 'draft'
      : currentMapMetadata?.is_draft === false
        ? 'share'
        : 'draft'
  );
  const [mapTags, setTags] = React.useState<string | undefined | null>(currentMapMetadata?.tags);
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

  const handleChangeIsDraft = (isDraft: boolean) => {
    setMapIsDraft(isDraft ? 'draft' : 'share');
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
    <>
      <BoxContainer>
        <Flex gap="4" width={'100%'} display={'flex'}>
          <Box width={'25%'}>
            {/* map status */}
            <Text weight={'medium'}> Status </Text>
            <Flex gap="2">
              <RadioGroup.Root
                value={mapIsDraft ?? undefined}
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
    </>
  );
};
