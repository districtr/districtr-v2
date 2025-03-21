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
  Separator,
} from '@radix-ui/themes';
import {metadata, document, sharePlan} from '@/app/utils/api/mutations';
import {styled} from '@stitches/react';

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
  const mapDocument = useMapStore(store => store.mapDocument);
  const gerryDBTable = mapDocument?.gerrydb_table;
  const [dialogOpen, setDialogOpen] = React.useState(open || false);
  const {upsertUserMap, setMapDocument} = useMapStore(store => store);
  const userMaps = useMapStore(store => store.userMaps);
  const currentMap = React.useMemo(
    () => userMaps.find(map => map.document_id === mapDocument?.document_id),
    [mapDocument?.document_id, userMaps]
  );
  const [sharetype, setSharetype] = React.useState('read');
  const [linkCopied, setLinkCopied] = React.useState(false);
  const [password, setPassword] = React.useState<string | null>(currentMap?.password ?? null);
  const [passwordDisabled, setPasswordDisabled] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(true); // whether pw is dots or text

  useEffect(() => {
    setDialogOpen(open || false);
  }, [open]);

  useEffect(() => {
    if (currentMap && currentMap.password) {
      setPassword(currentMap.password);
      setPasswordDisabled(true);
      setIsVisible(false);
    }
  }, [currentMap, mapDocument]);

  useEffect(() => {
    if (mapDocument && !currentMap) {
      setPasswordDisabled(false);
      setIsVisible(true);
      setPassword(null);
    }
  }, [mapDocument, currentMap]);

  const handleCreateShareLink = async () => {
    const payload = {
      document_id: mapDocument?.document_id,
      password: password ?? null,
      access_type: sharetype,
    };

    try {
      // get the share link
      const token = await sharePlan.mutate(payload);
      // copy to clipboard
      if (token !== undefined) {
        const shareableLink = `${window.location.origin}?share=${token.token}`;
        navigator.clipboard.writeText(shareableLink);

        if (password !== null && mapDocument?.document_id) {
          upsertUserMap({
            documentId: mapDocument?.document_id,
            mapDocument: {
              ...mapDocument,
              password: password,
            },
          });
          setIsVisible(false);
        }
        if (sharetype === 'edit') {
          setPasswordDisabled(true);
        }
        // Set link copied state
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      }
    } catch (error) {
      console.error('Error creating share link: ', error);
      useMapStore
        .getState()
        .setErrorNotification({message: 'Error creating share link', severity: 2});
    }
  };

  const handleShareTypeChange = (value: string) => {
    // handle share type change
    setSharetype(value);
  };

  const handleSetPassword = () => {
    // lock password field
    setPasswordDisabled(true);
    setIsVisible(false);

    if (password !== null && mapDocument?.document_id) {
      upsertUserMap({
        documentId: mapDocument?.document_id,
        mapDocument: {
          ...mapDocument,
          password: password,
        },
      });
    }
  };

  const handlePasswordEntry = (pw: string) => {
    if (pw) {
      setPassword(pw);
      return;
    } else {
      setPassword(null);
    }
  };

  const handleMapCopy = (documentId: string | undefined) => {
    if (mapDocument?.gerrydb_table) {
      document
        .mutate({
          districtr_map_slug: mapDocument?.gerrydb_table ?? '',
          metadata: mapDocument?.map_metadata,
          user_id: useMapStore.getState().userID,
          copy_from_doc: mapDocument?.document_id,
        })
        .then(data => {
          // update in db
          metadata.mutate({
            document_id: data.document_id,
            metadata: mapDocument?.map_metadata,
          });
          // update in usermaps
          upsertUserMap({
            documentId: data.document_id,
            mapDocument: {
              ...data,
              map_metadata: mapDocument?.map_metadata,
            },
          });
          // swap out current map with newly copied one
          data.map_metadata = mapDocument?.map_metadata;
          setMapDocument(data);
          // should open the map save modal with the proper map open?
        });
    }
  };

  useEffect(() => {
    if (!dialogOpen) {
      onClose?.();
    }
  }, [dialogOpen]);

  // ensure a map is loaded
  if (!mapDocument) {
    return <div></div>;
  }
  return (
    <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContentContainer className="max-w-[75vw]">
        <Flex align="center" className="mb-4">
          <Dialog.Title className="m-0 text-xl font-bold flex-1">Share</Dialog.Title>
          <Dialog.Close
            className="rounded-full size-[24px] hover:bg-red-100 p-1"
            aria-label="Close"
          >
            <Cross2Icon />
          </Dialog.Close>
        </Flex>
        <BoxContainer>
          {/* share logic */}
          {mapDocument?.genesis !== 'shared' ? (
            <>
              <Text size="2">
                Generate a URL to share your plan. If you share editable, then anyone with the
                password can take turns updating it. If you share it frozen, it can still be
                modified but the Plan ID will change.
              </Text>

              <Flex gap="2" className="flex-col">
                <RadioCards.Root onValueChange={handleShareTypeChange} value={sharetype}>
                  <RadioCards.Item value="read">
                    <Flex gap="2" className="items-center" direction={'column'}>
                      <Text weight={'bold'}>Share Frozen</Text>
                      <Text> (no password)</Text>
                    </Flex>
                  </RadioCards.Item>
                  <RadioCards.Item value="edit">
                    <Flex gap="2" className="items-center" direction={'column'}>
                      <Text weight={'bold'}>Share Editable</Text>
                      <Text> (password)</Text>
                    </Flex>
                  </RadioCards.Item>
                </RadioCards.Root>
                <Flex gap="2" className="flex-row items-center ">
                  {sharetype === 'read' ? (
                    <TextField.Root
                      disabled
                      type={isVisible ? 'text' : 'password'}
                      variant="soft"
                      placeholder={'Password'}
                      size="2"
                      value={password ?? undefined}
                      onChange={e => handlePasswordEntry(e.target.value)}
                      className="items-center w-1/2 invisible"
                    ></TextField.Root>
                  ) : (
                    <TextField.Root
                      disabled={passwordDisabled}
                      type={isVisible ? 'text' : 'password'}
                      variant="soft"
                      placeholder={'Password'}
                      size="2"
                      value={password ?? undefined}
                      onChange={e => handlePasswordEntry(e.target.value)}
                      className="items-center w-1/2 "
                    ></TextField.Root>
                  )}
                  {password && !passwordDisabled ? (
                    <IconButton
                      variant="soft"
                      className="flex items-center w-1/5"
                      onClick={handleSetPassword}
                    >
                      Save
                    </IconButton>
                  ) : sharetype === 'edit' && ((password && passwordDisabled) || !isVisible) ? (
                    <IconButton
                      variant="soft"
                      style={{width: '20%'}}
                      className="items-center "
                      onClick={() => setIsVisible(!isVisible)}
                    >
                      {!isVisible ? 'Show' : 'Hide'}
                    </IconButton>
                  ) : null}
                </Flex>
                <Button
                  variant="soft"
                  className="flex items-center"
                  onClick={handleCreateShareLink}
                  disabled={linkCopied ?? false}
                >
                  {linkCopied ? 'Copied!' : 'Click to Generate Link'}
                </Button>
              </Flex>
            </>
          ) : (
            <Flex gap="2" className="flex-col">
              <Button
                variant="soft"
                className="flex items-center"
                onClick={() => {
                  // make a copy of the map
                  useMapStore.getState().setAppLoadingState('loading');
                  handleMapCopy(mapDocument?.document_id);
                  setDialogOpen(false);
                }}
              >
                Make duplicate copy of this plan for editing
              </Button>

              <Button
                variant="soft"
                className="flex items-center"
                onClick={handleCreateShareLink}
                disabled={linkCopied ?? false}
              >
                {linkCopied ? 'Copied!' : 'Click to copy share link'}
              </Button>
            </Flex>
          )}
        </BoxContainer>
      </DialogContentContainer>
    </Dialog.Root>
  );
};
