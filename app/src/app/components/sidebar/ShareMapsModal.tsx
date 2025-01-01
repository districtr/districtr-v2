import {useMapStore} from '@/app/store/mapStore';
import React from 'react';
import {Cross2Icon, CounterClockwiseClockIcon} from '@radix-ui/react-icons';
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
import {DocumentObject} from '../../utils/api/apiHandlers';
import {styled} from '@stitches/react';
import {map, size} from 'lodash';
import {Description} from '@radix-ui/react-toast';
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

  const handleMapDocument = (data: NamedDocumentObject) => {
    setMapDocument(data);
    const urlParams = new URLSearchParams(searchParams.toString());
    urlParams.set('document_id', data.document_id);
    router.push(pathname + '?' + urlParams.toString());
    // close dialog
    setDialogOpen(false);
  };

  const mapName = userMaps.find(map => map.document_id === mapDocument?.document_id)?.name;

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

  console.log(window.location);
  console.log(
    `${window.location.origin}${window.location.pathname}?document_id=${mapDocument?.document_id}`
  );

  return (
    <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
      <Dialog.Trigger>
        <Button value="share" variant="outline">
          Share
        </Button>
      </Dialog.Trigger>
      <DialogContentContainer className="max-w-[75vw]" description="save-dialog">
        <Flex align="center" className="mb-4">
          <Dialog.Title className="m-0 text-xl font-bold flex-1">Share Map</Dialog.Title>
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
              <Checkbox size="1" /> Share as Draft
            </Flex>
          </Text>
          <Text as="label" size="2">
            <Flex gap="2">Click to copy</Flex>
          </Text>
          <TextField.Root
            variant="soft"
            value={`${window.location.origin}${window.location.pathname}?document_id=${mapDocument?.document_id}`}
            size="2"
            className="items-center"
            onClick={() => {
              navigator.clipboard.writeText(
                `${window.location.origin}${window.location.pathname}?document_id=${mapDocument?.document_id}`
              );
              console.log('copied that');
            }}
            onHover={() => {
              console.log('hovering');
            }}
          >
            <IconButton variant="ghost" size="1">
              <TextField.Slot>
                {/* on click, this needs to be the check icon instead of the clipboard icon */}
                <ClipboardCopyIcon height="14" width="14" />
              </TextField.Slot>
            </IconButton>
          </TextField.Root>
        </BoxContainer>
      </DialogContentContainer>
    </Dialog.Root>
  );
};
