import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import React, {useEffect} from 'react';
import {Cross2Icon} from '@radix-ui/react-icons';
import {Button, Flex, Text, Table, Dialog, Box, Separator, Popover} from '@radix-ui/themes';
import {useRouter} from 'next/navigation';
import {DocumentObject} from '@utils/api/apiHandlers/types';
import {useState} from 'react';
import {idb} from '@/app/utils/idb/idb';
import {useUserMaps} from '@/app/hooks/useUserMaps';

export const RecentMapsModal: React.FC<{
  open?: boolean;
  onClose?: () => void;
  showTrigger?: boolean;
}> = ({open, onClose, showTrigger}) => {
  const router = useRouter();
  const mapDocument = useMapStore(store => store.mapDocument);
  const setMapDocument = useMapStore(store => store.setMapDocument);
  const setActiveTool = useMapControlsStore(store => store.setActiveTool);
  const [updateTrigger, setUpdateTrigger] = useState<string | null | number>(null);
  const recentMaps = useUserMaps(updateTrigger);

  const handleUnloadMapDocument = () => {
    // Navigate to home page
    setMapDocument({} as DocumentObject);
    router.push('/map');
  };

  const handleMapDocument = async (data: DocumentObject) => {
    // Navigate to edit mode with the UUID
    router.push(`/map/edit/${data.document_id}`);
    // close dialog
    onClose?.();
  };

  const handleDeleteMap = async (documentId: string) => {
    await idb.deleteDocument(documentId);
    // Reload the list
    const storedDocs = await idb.getAllDocuments();
    const sortedDocs = storedDocs
      .map(doc => doc.document_metadata)
      .sort((a, b) => {
        const aTime = new Date(a.updated_at || 0).getTime();
        const bTime = new Date(b.updated_at || 0).getTime();
        return bTime - aTime;
      });
    setUpdateTrigger(Date.now());
  };

  const handleChangeName = async (userMapData: DocumentObject | undefined) => {
    if (userMapData && userMapData.document_id) {
      // Update the document in IndexedDB
      const storedDoc = await idb.getDocument(userMapData.document_id);
      if (storedDoc) {
        await idb.updateDocument({
          ...storedDoc,
          document_metadata: userMapData,
        });
        // Reload the list
        const storedDocs = await idb.getAllDocuments();
        const sortedDocs = storedDocs
          .map(doc => doc.document_metadata)
          .sort((a, b) => {
            const aTime = new Date(a.updated_at || 0).getTime();
            const bTime = new Date(b.updated_at || 0).getTime();
            return bTime - aTime;
          });
        setUpdateTrigger(Date.now());

      }
    }
  };

  useEffect(() => {
    if (!open) {
      setActiveTool('pan');
      // Ensure body pointer-events is restored when dialog closes
      document.body.style.pointerEvents = '';
    }
    // Cleanup on unmount
    return () => {
      document.body.style.pointerEvents = '';
    };
  }, [open, setActiveTool]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose?.();
    }
  };

  if (!recentMaps?.length) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      {!!showTrigger && (
        <Dialog.Trigger>
          <Button variant="ghost" disabled={!recentMaps.length}>
            Recent Maps
          </Button>
        </Dialog.Trigger>
      )}
      <Dialog.Content className="sm:w-[95vw] md:w-[60vw] max-h-[calc(100vh-2rem)]" id="recent-maps-modal">
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
        {/* table of user maps */}
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
              {recentMaps.map((userMap, i) => (
                // for all maps, including active map
                <RecentMapsRow
                  key={userMap.document_id || i}
                  active={mapDocument?.document_id === userMap.document_id}
                  onChange={handleChangeName}
                  data={userMap}
                  onSelect={handleMapDocument}
                  onDelete={() => {
                    handleDeleteMap(userMap.document_id);
                  }}
                  onUnload={handleUnloadMapDocument}
                />
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      </Dialog.Content>
    </Dialog.Root>
  );
};

const RecentMapsRow: React.FC<{
  data: DocumentObject;
  onSelect: (data: DocumentObject) => void;
  active: boolean;
  onChange?: (data?: DocumentObject) => void;
  onDelete: (data: DocumentObject) => void;
  onUnload: (data: DocumentObject) => void;
}> = ({data, onSelect, active, onChange, onDelete, onUnload}) => {
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
            Load
          </Button>
        ) : (
          <div style={{}}>
            <Button
              variant="outline"
              className="box-content mx-2 size-full rounded-xl hover:bg-blue-200 inline-flex transition-colors"
              onClick={() => onUnload(data)}
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
                <Popover.Close>
                  <Button
                    onClick={() => {
                      // this works but the row does not disappear;
                      //  only the data is removed + popover closes
                      onDelete(data);
                    }}
                    variant="outline"
                    className="w-full"
                  >
                    Remove
                  </Button>
                </Popover.Close>
              </Popover.Content>
            </Popover.Root>
          </>
        )}
      </Table.Cell>
    </Table.Row>
  );
};
