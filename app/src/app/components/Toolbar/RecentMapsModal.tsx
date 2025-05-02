import {useMapStore} from '@/app/store/mapStore';
import React, {useEffect} from 'react';
import {Cross2Icon} from '@radix-ui/react-icons';
import {Button, Flex, Text, Table, Dialog, Box, Separator, Popover} from '@radix-ui/themes';
import {usePathname, useSearchParams, useRouter} from 'next/navigation';
import {DocumentObject} from '@utils/api/apiHandlers/types';
import {styled} from '@stitches/react';
import {useTemporalStore} from '@/app/store/temporalStore';

const DialogContentContainer = styled(Dialog.Content, {
  maxWidth: '60vw',
  maxHeight: 'calc(100vh-2rem)',
});

export const RecentMapsModal: React.FC<{
  open?: boolean;
  onClose?: () => void;
  showTrigger?: boolean;
}> = ({open, onClose, showTrigger}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mapDocument = useMapStore(store => store.mapDocument);
  const userMaps = useMapStore(store => store.userMaps);
  const upsertUserMap = useMapStore(store => store.upsertUserMap);
  const deleteUserMap = useMapStore(store => store.deleteUserMap);
  const setMapDocument = useMapStore(store => store.setMapDocument);
  const setActiveTool = useMapStore(store => store.setActiveTool);
  const [dialogOpen, setDialogOpen] = React.useState(open || false);
  const [openItem, setOpenItem] = React.useState<string | null>(null);

  useEffect(() => {
    setDialogOpen(open || false);
  }, [open]);

  const clear = useTemporalStore(store => store.clear);

  const handleMapDocument = (data: DocumentObject) => {
    setMapDocument(data);
    clear();
    const urlParams = new URLSearchParams(searchParams.toString());
    urlParams.set('document_id', data.document_id);
    router.push(pathname + '?' + urlParams.toString());

    // open the correct accordion item
    setOpenItem(data.document_id);

    // close dialog
    setDialogOpen(false);
    onClose?.();
  };

  useEffect(() => {
    if (!dialogOpen) {
      setActiveTool('pan');
    }
  }, [dialogOpen]);

  useEffect(() => {
    if (!dialogOpen) {
      onClose?.();
    }
  }, [dialogOpen]);

  if (!userMaps?.length) {
    return null;
  }

  return (
    <Dialog.Root
      open={dialogOpen}
      onOpenChange={isOpen =>
        isOpen ? setDialogOpen(isOpen) : onClose ? onClose() : setDialogOpen(isOpen)
      }
    >
      {!!showTrigger && (
        <Dialog.Trigger>
          <Button variant="ghost" disabled={!userMaps.length}>
            Recent Maps
          </Button>
        </Dialog.Trigger>
      )}
      <DialogContentContainer className="md:w-[50vw]">
        <Flex align="center" className="mb-4">
          <Dialog.Title className="m-0 text-xl font-bold flex-1">Recent Maps</Dialog.Title>
          <Dialog.Close
            className="rounded-full size-[24px] hover:bg-red-100 p-1"
            aria-label="Close"
          >
            <Cross2Icon />
          </Dialog.Close>
        </Flex>
        <Separator size={'4'} className="my-4" />
        {/* table of non-active maps */}
        <Box className="max-h-[50vh] overflow-y-auto">
          <Table.Root size="3" variant="surface">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell pl=".5rem">Map Name</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Last Updated</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>{/* load */}</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>{/* delete */}</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>

            <Table.Body>
              {userMaps.map((userMap, i) => (
                // for all maps, including active map
                <RecentMapsRow
                  key={i}
                  active={mapDocument?.document_id === userMap.document_id}
                  onChange={userMapData =>
                    upsertUserMap({
                      userMapData,
                      userMapDocumentId: userMap.document_id,
                    })
                  }
                  data={userMap}
                  onSelect={handleMapDocument}
                  onDelete={() => {
                    deleteUserMap(userMap.document_id);
                  }}
                />
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      </DialogContentContainer>
    </Dialog.Root>
  );
};

const RecentMapsRow: React.FC<{
  data: DocumentObject;
  onSelect: (data: DocumentObject) => void;
  active: boolean;
  onChange?: (data?: DocumentObject) => void;
  onDelete?: (data?: DocumentObject) => void;
}> = ({data, onSelect, active, onChange, onDelete}) => {
  const updatedDate = new Date(data.updated_at as string);
  const formattedDate = updatedDate.toLocaleDateString();
  const metadataName = data?.map_metadata?.name || data.districtr_map_slug;
  const [mapName, setMapName] = React.useState(metadataName);
  const handleChangeName = (name: string | null) => {
    // if name does not match metadata, make eligible to save
    if (name !== metadataName && name !== null) {
      setMapName(name);
    }
  };

  const handleChangeNameMetadata = (value: string | null) => {
    if (value !== metadataName) {
      handleChangeName(value);
    }
    onChange?.({...data, map_metadata: {...data.map_metadata, name: value}});
  };

  return (
    <Table.Row align="center" className={`${active ? 'bg-yellow-100' : ''}`}>
      <Table.Cell pl=".5rem">
        <Text>{mapName}</Text>
      </Table.Cell>
      <Table.Cell>
        <Text>{formattedDate}</Text>
      </Table.Cell>
      <Table.Cell py=".5rem" justify="center">
        {!active ? (
          <Button
            onClick={() => onSelect(data)}
            variant="outline"
            className="box-content size-full rounded-xl hover:bg-blue-200 inline-flex transition-colors"
          >
            Ready to Load
          </Button>
        ) : (
          <div style={{}}>
            <Button
              disabled
              variant="outline"
              className="box-content mx-2 size-full rounded-xl hover:bg-blue-200 inline-flex transition-colors"
            >
              Active
            </Button>
            <Button
              disabled
              variant="outline"
              className="box-content mx-2 size-full rounded-xl hover:bg-blue-200 inline-flex transition-colors"
            >
              Unload
            </Button>
          </div>
        )}
      </Table.Cell>
      <Table.Cell py=".5rem">
        {!active && (
          <>
            <Popover.Root>
              <Popover.Trigger>
                <Button variant="ghost" color="ruby" className="size-full">
                  Remove from List
                </Button>
              </Popover.Trigger>
              <Popover.Content sideOffset={5} className="w-[200px] p-2 bg-white rounded-md">
                <Text>Are you sure? This cannot be undone.</Text>
                <Separator className="my-2" />
                <Button
                  onClick={() => console.log('deleting')}
                  variant="outline"
                  className="w-full"
                >
                  Remove
                </Button>
              </Popover.Content>
            </Popover.Root>
          </>
        )}
      </Table.Cell>
    </Table.Row>
  );
};
