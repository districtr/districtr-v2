import {useMapStore} from '@/app/store/mapStore';
import React, {useEffect} from 'react';
import {Cross2Icon} from '@radix-ui/react-icons';
import {Button, Flex, Text, Dialog, Box, TextField, IconButton, RadioCards} from '@radix-ui/themes';
import {styled} from '@stitches/react';
import {getShareLink} from '@/app/utils/api/apiHandlers/getShareMap';
import {getMapCopy} from '@/app/utils/api/apiHandlers/getMapCopy';

const DialogContentContainer = styled(Dialog.Content);

const BoxContainer = styled(Box, {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
});

export const ShareMapsModal: React.FC<{
  open?: boolean;
  onClose?: () => void;
}> = ({open, onClose}) => {
  const mapDocument = useMapStore(store => store.mapDocument);
  const mapStatus = useMapStore(store => store.mapStatus);
  const [dialogOpen, setDialogOpen] = React.useState(open || false);
  const {upsertUserMap} = useMapStore(store => store);
  const userMaps = useMapStore(store => store.userMaps);
  const currentMap = useMapStore(store =>
    userMaps.find(map => map.document_id === mapDocument?.document_id)
  );
  const [shareType, setShareType] = React.useState<'read' | 'edit'>('read');
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

  const handleshareTypeChange = (value: 'read' | 'edit') => {
    // handle share type change
    setShareType(value);
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

  useEffect(() => {
    if (!dialogOpen) {
      onClose?.();
    }
  }, [dialogOpen]);

  // ensure a map is loaded
  if (!mapDocument || !mapStatus) {
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
          {mapStatus?.genesis !== 'shared' ? (
            <>
              <Text size="2">
                Generate a URL to share your plan. If you share editable, then anyone with the
                password can take turns updating it. If you share it frozen, it can still be
                modified but the Plan ID will change.
              </Text>

              <Flex gap="2" className="flex-col">
                <RadioCards.Root onValueChange={handleshareTypeChange} value={shareType}>
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
                  {shareType === 'edit' && <Text size="2">Password</Text>}
                  {shareType === 'read' ? (
                    <TextField.Root
                      disabled
                      type={isVisible ? 'text' : 'password'}
                      variant="soft"
                      placeholder={'Password'}
                      size="2"
                      value={password ?? undefined}
                      onChange={e => setPassword(e.target.value || null)}
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
                      onChange={e => setPassword(e.target.value || null)}
                      className="items-center w-1/2 flex-1"
                    ></TextField.Root>
                  )}
                  {password && !passwordDisabled ? (
                    <Button
                      variant="soft"
                      className="flex items-center w-1/5"
                      onClick={handleSetPassword}
                    >
                      Save
                    </Button>
                  ) : shareType === 'edit' && ((password && passwordDisabled) || !isVisible) ? (
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
                  onClick={() =>
                    getShareLink(
                      password ?? null,
                      shareType,
                      setIsVisible,
                      setPasswordDisabled,
                      setLinkCopied
                    )
                  }
                  disabled={(linkCopied || (shareType === 'edit' && !password)) ?? false}
                >
                  {linkCopied ? 'Copied!' : 'Click to Copy Link'}
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
                  getMapCopy();
                  setDialogOpen(false);
                }}
              >
                Make duplicate copy of this plan for editing
              </Button>

              <Button
                variant="soft"
                className="flex items-center"
                onClick={() => {
                  getShareLink(
                    password ?? null,
                    shareType,
                    setIsVisible,
                    setPasswordDisabled,
                    setLinkCopied
                  );
                }}
                disabled={(linkCopied || !password) ?? false}
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
