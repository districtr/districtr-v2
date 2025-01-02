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
import {ClipboardCopyIcon, MagnifyingGlassIcon} from '@radix-ui/react-icons';
import {usePathname, useSearchParams, useRouter} from 'next/navigation';
import {DocumentMetadata, DocumentObject} from '../../utils/api/apiHandlers';
import {styled} from '@stitches/react';
import {map, size} from 'lodash';
import {Description} from '@radix-ui/react-toast';
import {metadata} from '@/app/utils/api/mutations';
type NamedDocumentObject = DocumentObject & {name?: string};

const DialogContentContainer = styled(Dialog.Content);

const BoxContainer = styled(Box, {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  // maxWidth: '200px',
});

export const ShareMapsModal = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mapDocument = useMapStore(store => store.mapDocument);
  const userMaps = useMapStore(store => store.userMaps);
  const upsertUserMap = useMapStore(store => store.upsertUserMap);
  const setMapDocument = useMapStore(store => store.setMapDocument);
  const gerryDBTable = mapDocument?.gerrydb_table;
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

  const mapName = userMaps.find(map => map.document_id === mapDocument?.document_id)?.name || '';

  const [name, setName] = React.useState(mapName);
  const [tagsTeam, setTagsTeam] = React.useState<string>('');

  const handleChangeName = (name?: string) => {
    // name?.length
    if (name) {
      setName(name);
    }
  };

  // if no gerrydb table selected, return null
  if (!gerryDBTable) {
    return null;
  }

  const handleMapSave = () => {
    // upsert map locally and also save to db
    // const data = {
    //   ...mapDocument,
    //   name,
    //   tags: tagsTeam,
    // };
    // // upsertUserMap(data);
    // console.log(data);
    // save to db
    const metadataObjects = [
      {key: 'name', value: name},
      {key: 'tags', value: tagsTeam},
    ];
    const formattedMetadata: DocumentMetadata[] = metadataObjects.map(obj => {
      return {
        document_id: mapDocument?.document_id,
        key: obj.key,
        value: obj.value,
      };
    });
    metadata.mutate(formattedMetadata);
    // formattedMetadata.forEach(meta => metadata.mutate(meta));
  };

  return (
    <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
      <Dialog.Trigger>
        <Button value="share" variant="outline">
          Save / Share
        </Button>
      </Dialog.Trigger>
      <DialogContentContainer className="max-w-[75vw]" description="save-dialog">
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
            <TextField.Root
              placeholder={'Team or Plan Name'}
              size="3"
              value={name}
              onChange={e => handleChangeName(e.target.value)}
            ></TextField.Root>
          </Box>
          <Box maxWidth="200px">
            <TextField.Root
              placeholder="Tag or Event Code"
              size="3"
              value={tagsTeam}
              onChange={e => handleChangeName(e.target.value)}
            ></TextField.Root>
          </Box>
          <Text as="label" size="2">
            <Flex gap="2">
              <Checkbox size="1" /> Save as Draft
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
          <Button variant="soft" className="flex items-center" onClick={handleMapSave}>
            Save
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
