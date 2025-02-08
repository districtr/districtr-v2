import {useMapStore} from '@/app/store/mapStore';
import React from 'react';
import {Cross2Icon} from '@radix-ui/react-icons';
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
} from '@radix-ui/themes';
import {usePathname, useSearchParams, useRouter} from 'next/navigation';
import {DocumentMetadata, DocumentObject} from '../../utils/api/apiHandlers';
import {styled} from '@stitches/react';
import {metadata, document} from '@/app/utils/api/mutations';
import {map, set} from 'lodash';

type NamedDocumentObject = DocumentObject & {name?: string};

const DialogContentContainer = styled(Dialog.Content);

const BoxContainer = styled(Box, {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
});

export const ShareMapsModal = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mapDocument = useMapStore(store => store.mapDocument);
  const setMapDocument = useMapStore(store => store.setMapDocument);
  const gerryDBTable = mapDocument?.gerrydb_table;
  const userMaps = useMapStore(store => store.userMaps);
  const upsertUserMap = useMapStore(store => store.upsertUserMap);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [clickToCopyPrompt, setClickToCopyPrompt] = React.useState('Click to copy');

  const handleClickToCopy = () => {
    navigator.clipboard.writeText(
      `${window.location.origin}${window.location.pathname}?document_id=${mapDocument?.document_id}`
    );
    setClickToCopyPrompt('Copied!');
    setTimeout(() => {
      setClickToCopyPrompt('Click to copy');
    }, 2000);
  };

  const handleMapDocument = (data: NamedDocumentObject) => {
    setMapDocument(data);
    const urlParams = new URLSearchParams(searchParams.toString());
    urlParams.set('document_id', data.document_id);
    router.push(pathname + '?' + urlParams.toString());
    // close dialog
    setDialogOpen(false);
  };

  // get map name from metadata if it exists
  const mapName =
    userMaps.find(map => map.document_id === mapDocument?.document_id)?.map_metadata.name ||
    undefined;
  const mapTags =
    userMaps.find(map => map.document_id === mapDocument?.document_id)?.map_metadata.tags ||
    undefined;

  const [name, setName] = React.useState(mapName);
  const [tagsTeam, setTagsTeam] = React.useState(mapTags);
  const [nameIsSaved, setNameIsSaved] = React.useState(false);
  const [tagsIsSaved, setTagsIsSaved] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [copiedPlanName, setCopiedPlanName] = React.useState(null);

  const handleChangeName = (name: string | null) => {
    // if name does not match metadata, make eligible to save
    if (name !== mapName) {
      setNameIsSaved(false);
    }
  };

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

  const handleCopyMetadataChange = (key: keyof DocumentMetadata, value: any) => {
    // todo: handle copy metadata change
    setCopiedPlanName(value);
  };

  const handleMapSave = () => {
    if (mapDocument?.document_id) {
      const savedMapMetadata = userMaps.find(
        map => map.document_id === mapDocument?.document_id
      )?.map_metadata;
      if (!savedMapMetadata) {
        return;
      }
      if (mapDocument?.status === 'locked') {
        // if you have a locked map, save a copy
        document.mutate({
          gerrydb_table: mapDocument?.gerrydb_table,
          metadata: savedMapMetadata,
        });
      } else {
        // otherwise just update
        metadata.mutate({
          document_id: mapDocument?.document_id,
          metadata: savedMapMetadata,
        });
      }
    }

    setNameIsSaved(true);
    setTagsIsSaved(true);
  };

  // if no gerrydb table selected return null
  if (!gerryDBTable) {
    return null;
  }

  return (
    <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
      <Dialog.Trigger>
        <Button value="share" variant="outline">
          Save and Collaborate
        </Button>
      </Dialog.Trigger>
      <DialogContentContainer className="max-w-[75vw]">
        <Flex align="center" className="mb-4">
          <Dialog.Title className="m-0 text-xl font-bold flex-1">Save and Collaborate</Dialog.Title>
          <Dialog.Close
            className="rounded-full size-[24px] hover:bg-red-100 p-1"
            aria-label="Close"
          >
            <Cross2Icon />
          </Dialog.Close>
        </Flex>
        <BoxContainer>
          <Box maxWidth="200px">
            {mapDocument?.status && mapDocument?.status === 'locked' ? (
              <Text>Name your Copy </Text>
            ) : (
              <Text>Team or Plan Name</Text>
            )}
            <TextField.Root
              placeholder={mapName ?? 'Plan Name'}
              size="3"
              value={mapName}
              onChange={e => handleMetadataChange('name', e.target.value)}
            ></TextField.Root>
          </Box>
          <Box maxWidth="200px">
            <Text>Tags</Text>
            <TextField.Root
              placeholder={'Tag or Event Code'}
              size="3"
              value={tagsTeam}
              disabled
              onChange={e => handleMetadataChange('tags', e.target.value)}
            ></TextField.Root>
          </Box>
          <Text as="label" size="2">
            <Flex gap="2">
              <Checkbox size="1" disabled /> Save as Draft (coming soon)
            </Flex>
          </Text>
          {/* share logic */}
          <Text as="label" size="3">
            <Flex gap="2">Sharing</Flex>
          </Text>
          {/* 
              - button for share view only mode
                - optional add password
              - button for make editable
                - optional add password
              */}
          <Text size="2">
            You can share your plan with others! Share as <b>View Only</b> to let others see and
            copy your plan. <b>Share and make editable</b> to allow others to directly edit your
            plan. You can optionally <b>set a password</b> to restrict who can interact with it.
          </Text>
          <TextField.Root
            variant="soft"
            placeholder="(Optional) Set a password"
            size="2"
            className="items-center"
          ></TextField.Root>
          <Flex gap="2" className="flex-col">
            <Button variant="soft" className="flex items-center" disabled={false}>
              Share View Only
            </Button>
            <Button variant="soft" className="flex items-center" disabled={false}>
              Share and make editable
            </Button>
          </Flex>
          {/* end share logic */}
          {/*<Text as="label" size="2">
            <Flex gap="2">{clickToCopyPrompt}</Flex>
          </Text>
          <TextField.Root
            variant="soft"
            value={`${window.location.origin}${window.location.pathname}?document_id=${mapDocument?.document_id}`}
            size="2"
            readOnly
            className="items-center"
            onClick={handleClickToCopy}
          ></TextField.Root> */}

          <Box className="border-t border-gray-200"></Box>
          {/* save + close */}
          <Button
            variant="soft"
            className="flex items-center"
            onClick={handleMapSave}
            disabled={nameIsSaved && tagsIsSaved}
          >
            {mapDocument.status !== 'locked' && nameIsSaved && tagsIsSaved
              ? 'Saved!'
              : mapDocument.status === 'locked'
                ? 'Create Copy'
                : 'Save'}
          </Button>
          <Button
            variant="soft"
            className="flex items-center"
            onClick={() => {
              setDialogOpen(false);
            }}
          >
            Close
          </Button>
        </BoxContainer>
      </DialogContentContainer>
    </Dialog.Root>
  );
};
