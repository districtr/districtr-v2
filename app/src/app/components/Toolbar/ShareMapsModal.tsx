import {useMapStore} from '@/app/store/mapStore';
import React, {useEffect} from 'react';
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
import {metadata, document, sharePlan} from '@/app/utils/api/mutations';

type NamedDocumentObject = DocumentObject & {name?: string};

const DialogContentContainer = styled(Dialog.Content);

const BoxContainer = styled(Box, {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
});

export const ShareMapsModal: React.FC<{
  open?: boolean;
  onClose?: () => void;
  showTrigger?: boolean;
}> = ({open, onClose, showTrigger}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mapDocument = useMapStore(store => store.mapDocument);
  const setMapDocument = useMapStore(store => store.setMapDocument);
  const gerryDBTable = mapDocument?.gerrydb_table;
  const userMaps = useMapStore(store => store.userMaps);
  const upsertUserMap = useMapStore(store => store.upsertUserMap);
  const [dialogOpen, setDialogOpen] = React.useState(open || false);
  const [clickToCopyPrompt, setClickToCopyPrompt] = React.useState('Click to copy');

  useEffect(() => {
    setDialogOpen(open || false);
  }, [open]);

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
    userMaps.find(map => map.document_id === mapDocument?.document_id)?.map_metadata?.name ||
    undefined;
  const mapTags =
    userMaps.find(map => map.document_id === mapDocument?.document_id)?.map_metadata?.tags ||
    undefined;

  const [name, setName] = React.useState(mapName);
  const [tagsTeam, setTagsTeam] = React.useState(mapTags);
  const [nameIsSaved, setNameIsSaved] = React.useState(false);
  const [tagsIsSaved, setTagsIsSaved] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [copiedPlanName, setCopiedPlanName] = React.useState(null);
  const [sharetype, setSharetype] = React.useState('view');
  const [linkCopied, setLinkCopied] = React.useState(false);
  const [password, setPassword] = React.useState<string | null>(null);

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

  const handleCreateShareLink = async () => {
    const payload = {
      document_id: mapDocument?.document_id,
      password: password ?? null,
      access_type: sharetype,
    };

    try {
      // get the share link
      sharePlan.mutate(payload).then(token => {
        // copy to clipboard
        const shareableLink = `${window.location.origin}?share=${token.token}`;
        navigator.clipboard.writeText(shareableLink);

        // Set link copied state
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      });
    } catch (error) {
      console.error('Error creating share link: ', error);
    }
  };

  const handleShareTypeChange = (value: string) => {
    // handle share type change
    setSharetype(value);
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
          user_id: useMapStore.getState().userID,
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

  const handlePasswordEntry = (pw: string) => {
    if (pw !== undefined && pw !== null) {
      if (pw.length > 0) {
        setPassword(pw);
        return;
      } else {
        setPassword(null);
      }
    }
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
    <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
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
              value={tagsTeam ?? ''}
              disabled
              onChange={e => handleMetadataChange('tags', e.target.value)}
            ></TextField.Root>
          </Box>
          <Text as="label" size="2">
            <Flex gap="2">
              <Checkbox size="1" disabled /> Save as Draft (coming soon)
            </Flex>
          </Text>

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
          <Box className="border-t border-gray-200"></Box>
          {/* share logic */}
          <Text as="label" size="3">
            <Flex gap="2">Sharing</Flex>
          </Text>
          <Text size="2">
            You can share your plan with others! Share as <b>View Only</b> to let others see and
            copy your plan. <b>Share and make editable</b> to allow others to directly edit your
            plan. You can optionally <b>set a password</b> to restrict who can interact with it.
          </Text>
          <TextField.Root
            disabled={mapDocument.genesis === 'shared'}
            variant="soft"
            placeholder={
              mapDocument.genesis === 'shared'
                ? 'Cannot edit password on shared plan'
                : '(Optional) Set a password'
            }
            size="2"
            value={password ?? undefined}
            onChange={e => handlePasswordEntry(e.target.value)}
            className="items-center"
          ></TextField.Root>
          <Flex gap="2" className="flex-col">
            <RadioCards.Root
              onValueChange={handleShareTypeChange}
              value={mapDocument.genesis === 'shared' ? null : sharetype}
            >
              <RadioCards.Item value="view" disabled={mapDocument.genesis === 'shared' ?? false}>
                Share View Only
              </RadioCards.Item>
              <RadioCards.Item value="edit" disabled={mapDocument.genesis === 'shared' ?? false}>
                Share and make editable
              </RadioCards.Item>
            </RadioCards.Root>
            <Button
              variant="soft"
              className="flex items-center"
              onClick={handleCreateShareLink}
              disabled={linkCopied ?? false}
            >
              {linkCopied ? 'Copied!' : 'Click to copy link'}
            </Button>
          </Flex>
          {/* end share logic */}
          <Box className="border-t border-gray-200"></Box>
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
