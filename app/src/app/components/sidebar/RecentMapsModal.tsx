import { useMapStore } from "@/app/store/mapStore";;
import { useLocalStorage } from "@/app/utils/hooks/useLocalStorage";
import React from "react";
import { Cross2Icon } from "@radix-ui/react-icons";
import {
  Button,
  Flex,
  Text,
  Table,
  Dialog,
  Box,
  TextField,
  IconButton
} from "@radix-ui/themes";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { DocumentObject } from "../../utils/api/apiHandlers";
import { userMapsLocalStorageKey } from "@/app/store/localCacheSubs";
type NamedDocumentObject = DocumentObject & { name?: string };
export const RecentMapsModal = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mapDocument = useMapStore((store) => store.mapDocument);
  const setMapDocument = useMapStore((store) => store.setMapDocument);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const handleMapDocument = (data: NamedDocumentObject) => {
    setMapDocument(data);
    const urlParams = new URLSearchParams(searchParams.toString());
    urlParams.set("document_id", data.document_id);
    router.push(pathname + "?" + urlParams.toString());
    // close dialog
    setDialogOpen(false);
  };

  const [recentMaps, setRecentMaps] = useLocalStorage<NamedDocumentObject[]>(
    undefined as any,
    userMapsLocalStorageKey,
    mapDocument
  );

  const getHandleChange = (i: number) => {
    const handleChange = (data: NamedDocumentObject | null) => {
      setRecentMaps((previous) => {
        const updatedMaps = [...previous]; // Create a copy of the previous maps
        if (data) {
          updatedMaps.splice(i, 1, data); // Replace the map at index i with the new data
        } else {
          if (
            previous[i].document_id === mapDocument?.document_id
          ) {
            // remove document_id query param
            const urlParams = new URLSearchParams(searchParams.toString());
            urlParams.delete("document_id"); // Remove the document_id parameter
            router.push(pathname + "?" + urlParams.toString()); // Update the URL without document_id
          }
          // remove entry if null
          updatedMaps.splice(i, 1); // Remove the entry at index i
        }
        return updatedMaps; // Return the updated array
      });
    };
    return handleChange; // Return the handleChange function
  };

  if (!recentMaps?.length) {
    return null;
  }

  return (
    <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
      <Dialog.Trigger>
        <Button
          variant="ghost"
          size="3"
          // weird negative margin happening.
          style={{ margin: 0 }}
        >
          Recent
        </Button>
      </Dialog.Trigger>
      <Dialog.Content className="max-w-[75vw]">
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
              <Table.ColumnHeaderCell>
                {/* load */}
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>
                {/* delete */}
              </Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>

          <Table.Body>
            {recentMaps.map((recentMap, i) => (
              <RecentMapsRow
                key={i}
                active={mapDocument?.document_id === recentMap.document_id}
                onChange={getHandleChange(i)}
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
  data: NamedDocumentObject;
  onSelect: (data: NamedDocumentObject) => void;
  active: boolean;
  onChange?: (data: NamedDocumentObject | null) => void;
}> = ({ data, onSelect, active, onChange }) => {
  const updatedDate = new Date(data.updated_at as string);
  const formattedData = updatedDate.toLocaleDateString();
  const name = data?.name || data.gerrydb_table;

  const handleChangeName = (data: NamedDocumentObject) => {
    if (onChange && data.name?.length) {
      onChange?.(data);
    }
  }

  return (
    <Table.Row align="center" className={`${active ? "bg-yellow-100" : ""}`}>
      <Table.Cell pl=".5rem">
        {!!(active && onChange) ? (
          <Box maxWidth="200px">
            <TextField.Root
              placeholder={name}
              size="3"
              value={name}
              onChange={(e) => handleChangeName({...data, name:e.target.value})}
            >
            </TextField.Root>
          </Box>
        ) : (
          <Text>{name}</Text>
        )}
      </Table.Cell>
      <Table.Cell>
        <Text>{formattedData}</Text>
      </Table.Cell>
      <Table.Cell py=".5rem">
        {!active && (
          <Button
            onClick={() => onSelect(data)}
            variant="outline"
            className="box-content size-full rounded-xl hover:bg-blue-200 inline-flex transition-colors"
          >
            Load
          </Button>
        )}
      </Table.Cell>
      <Table.Cell py=".5rem">
        {!active && (
          <IconButton
            onClick={() => onChange?.(null)}
            variant="ghost"
            color="ruby"
            className="size-full"
          >
            <Cross2Icon/>
          </IconButton>
        )}
      </Table.Cell>
    </Table.Row>
  );
};
