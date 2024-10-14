import { userMapsLocalStorageKey, useMapStore } from "@/app/store/mapStore";
import { useLocalStorage } from "@/app/utils/hooks/useLocalStorage";
import React from "react";
import { Cross2Icon } from "@radix-ui/react-icons";
import { Button, Flex, Text, Table, Dialog } from "@radix-ui/themes";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { DocumentObject } from "../../utils/api/apiHandlers";

export const RecentMapsModal = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mapDocument = useMapStore((store) => store.mapDocument);
  const setMapDocument = useMapStore((store) => store.setMapDocument);
  const [dialogOpen, setDialogOpen] = React.useState(false)

  const handleMapDocument = (data: DocumentObject) => {
    setMapDocument(data);
    const urlParams = new URLSearchParams(searchParams.toString());
    urlParams.set("document_id", data.document_id);
    router.push(pathname + "?" + urlParams.toString());
    // close dialog
    setDialogOpen(false)
  };


  const [recentMaps] = useLocalStorage<any[]>(
    undefined as any,
    userMapsLocalStorageKey,
    mapDocument
  );

  if (!recentMaps?.length) {
    return null;
  }

  return (
    <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}> 
      <Dialog.Trigger>
        <Button variant="ghost" size="3">
          Recent
        </Button>
      </Dialog.Trigger>
      <Dialog.Content>
        <Flex align="center" className="mb-4">
          <Dialog.Title className="m-0 text-xl font-bold flex-1">
            Recent Maps
          </Dialog.Title>

          <Dialog.Close
            className="rounded-full size-[24px] hover:bg-red-100 p-1"
            aria-label="Close"
          >
            <Cross2Icon />
          </Dialog.Close>
        </Flex>
        <Table.Root size="3" variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell pl=".5rem">
                Map Name
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Last Updated</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>ID</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell></Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>

          <Table.Body>
            {recentMaps.map((recentMap) => (
              <RecentMapsRow
                key={recentMap.document_id}
                data={recentMap}
                onSelect={handleMapDocument}
              />
            ))}
          </Table.Body>
        </Table.Root>
      </Dialog.Content>
    </Dialog.Root>
  );
};

const RecentMapsRow: React.FC<{
  data: DocumentObject;
  onSelect: (data: DocumentObject) => void;
}> = ({ data, onSelect }) => {
  const updatedDate = new Date(data.updated_at as string);
  const formattedData = updatedDate.toLocaleDateString();
  return (
    <Table.Row align="center">
      <Table.Cell pl=".5rem">
        <Text>{data.gerrydb_table}</Text>
      </Table.Cell>
      <Table.Cell>
        <Text>{formattedData}</Text>
      </Table.Cell>
      <Table.Cell>
        <Text>{data.document_id.slice(0, 8)}...</Text>
      </Table.Cell>
      <Table.Cell py=".5rem">
        <Button
          onClick={() => onSelect(data)}
          variant="outline"
          className="box-content size-full rounded-xl hover:bg-blue-200 inline-flex transition-colors"
        >
          Load
        </Button>
      </Table.Cell>
    </Table.Row>
  );
};
