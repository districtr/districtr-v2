import { useMapStore } from "@/app/store/mapStore";
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
  IconButton,
} from "@radix-ui/themes";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { DocumentObject } from "../../utils/api/apiHandlers";
type NamedDocumentObject = DocumentObject & { name?: string };
export const RecentMapsModal = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mapDocument = useMapStore((store) => store.mapDocument);
  const userMaps = useMapStore((store) => store.userMaps);
  const upcertUserMap = useMapStore((store) => store.upcertUserMap);
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

  if (!userMaps?.length) {
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
              <Table.ColumnHeaderCell>{/* load */}</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>{/* delete */}</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>

          <Table.Body>
            {userMaps.map((userMap, i) => (
              <RecentMapsRow
                key={i}
                active={mapDocument?.document_id === userMap.document_id}
                onChange={(userMapData) =>
                  upcertUserMap({
                    userMapData,
                    userMapDocumentId: userMap.document_id,
                  })
                }
                data={userMap}
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
  onChange?: (data?: NamedDocumentObject) => void;
}> = ({ data, onSelect, active, onChange }) => {
  const updatedDate = new Date(data.updated_at as string);
  const formattedData = updatedDate.toLocaleDateString();
  const name = data?.name || data.gerrydb_table;

  const handleChangeName = (name?: string) => {
    name?.length && onChange?.({ ...data, name });
  };

  return (
    <Table.Row align="center" className={`${active ? "bg-yellow-100" : ""}`}>
      <Table.Cell pl=".5rem">
        {!!(active && onChange) ? (
          <Box maxWidth="200px">
            <TextField.Root
              placeholder={name}
              size="3"
              value={name}
              onChange={(e) => handleChangeName(e.target.value)}
            ></TextField.Root>
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
            onClick={() => onChange?.()}
            variant="ghost"
            color="ruby"
            className="size-full"
          >
            <Cross2Icon />
          </IconButton>
        )}
      </Table.Cell>
    </Table.Row>
  );
};
