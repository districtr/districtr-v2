import {useMapStore} from '@/app/store/mapStore';
import React, from 'react';
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
import {metadata} from '@/app/utils/api/mutations';

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
  const updateMetadata = useMapStore(store => store.updateMetadata);
  const upsertUserMap = useMapStore(store => store.upsertUserMap);
  const mapMetadata = useMapStore.getState().mapMetadata;
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
  const mapName = mapDocument?.map_metadata?.name || undefined;
  const mapTags = mapDocument?.map_metadata?.tags || undefined;

  const [name, setName] = React.useState(mapName);
  const [tagsTeam, setTagsTeam] = React.useState(mapTags);
  const [nameIsSaved, setNameIsSaved] = React.useState(false);
  const [tagsIsSaved, setTagsIsSaved] = React.useState(false);

  const handleChangeName = (name?: string) => {
    if (mapDocument?.document_id) {
      setName(name);
      upsertUserMap({
        documentId: mapDocument?.document_id,
        mapDocument: {
          ...mapDocument,
          map_metadata: {
            ...mapDocument.map_metadata,
            name: name ?? null,
            tags: mapDocument.map_metadata?.tags ?? null,
          },
        }        
      });
      // if name does not match metadata, make eligible to save
      if (name !== mapName) {
        setNameIsSaved(false);
      }
    }
  };

  const handleChangeTag = (tag?: string) => {
    if (mapDocument?.document_id) {
      setTagsTeam([tag || '']);
      upsertUserMap({
        documentId: mapDocument?.document_id,
        mapDocument: {
          ...mapDocument,
          map_metadata: {
            ...mapDocument.map_metadata,
            name: name,
          },
        }        
      });

      if (tag !== mapTags) {
        setTagsIsSaved(false);
      }
    }
  };

  const handleMetadataChange = (key: keyof DocumentMetadata, value: any) => {
    if (mapDocument?.document_id) {
      upsertUserMap({
        documentId: mapDocument?.document_id,
        mapDocument: {
          ...mapDocument,
          map_metadata: {
            ...mapDocument.map_metadata,
            [key]: value,
          },
        },
      });
    }
  }

  // if no gerrydb table selected or no edits made, return null
  if (!gerryDBTable || !userMaps?.length) {
    return null;
  }

  const checkIfMapInUserMaps = (document_id: string) => {
    return userMaps.some(map => map.document_id === document_id);
  }

  const handleMapSave = () => {
    const metadataObjects = useMapStore.getState().mapMetadata;
    if (mapDocument?.document_id) {
      
      const savedMapMetadata = userMaps.find(map => map.document_id === mapDocument?.document_id)?.map_metadata;
      if (!savedMapMetadata) {
        return;
      }
      metadata.mutate({
        document_id: mapDocument?.document_id,
        metadata: savedMapMetadata,
      });
    }

    setNameIsSaved(true);
    setTagsIsSaved(true);
  };

  return (
    <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
      <Dialog.Trigger>
        <Button value="share" variant="outline">
          Save / Share
        </Button>
      </Dialog.Trigger>
      <DialogContentContainer className="max-w-[75vw]">
        <Flex align="center" className="mb-4">
          <Dialog.Title className="m-0 text-xl font-bold flex-1">Save and Share Map</Dialog.Title>
          <Dialog.Close
            className="rounded-full size-[24px] hover:bg-red-100 p-1"
            aria-label="Close"
          >
            <Cross2Icon />
          </Dialog.Close>
        </Flex>
        <BoxContainer>
          <Box maxWidth="200px">
            <Text>Team or Plan Name</Text>
            <TextField.Root
              placeholder={mapName ?? 'Team or Plan Name'}
              size="3"
              value={mapName}
              onChange={e => handleMetadataChange('name', e.target.value)}
            ></TextField.Root>
          </Box>
          <Box maxWidth="200px">
            <Text>Tags</Text>
            <TextField.Root
              placeholder={mapTags ?? 'Tag or Event Code'}
              size="3"
              value={tagsTeam}
              onChange={e => handleMetadataChange('tags', e.target.value)}
            ></TextField.Root>
          </Box>
          <Text as="label" size="2">
            <Flex gap="2">
              <Checkbox size="1" disabled /> Save as Draft (coming soon)
            </Flex>
          </Text>
          <Text as="label" size="2">
            <Flex gap="2">{clickToCopyPrompt}</Flex>
          </Text>
          <TextField.Root
            variant="soft"
            value={`${window.location.origin}${window.location.pathname}?document_id=${mapDocument?.document_id}`}
            size="2"
            readOnly
            className="items-center"
            onClick={handleClickToCopy}
          ></TextField.Root>
          <Button
            variant="soft"
            className="flex items-center"
            onClick={handleMapSave}
            disabled={nameIsSaved && tagsIsSaved}
          >
            {nameIsSaved && tagsIsSaved ? 'Saved!' : 'Save'}
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
