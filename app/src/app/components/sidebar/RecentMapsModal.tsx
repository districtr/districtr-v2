import { userMapsLocalStorageKey, useMapStore } from "@/app/store/mapStore";
import { useLocalStorage } from "@/app/utils/hooks/useLocalStorage";
import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Cross2Icon } from "@radix-ui/react-icons";
import { Button, Flex, Text } from "@radix-ui/themes";
import { DocumentObject } from "@/app/api/apiHandlers";
import { usePathname, useSearchParams, useRouter } from "next/navigation";

export const RecentMapsModal = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mapDocument = useMapStore((store) => store.mapDocument);
  const setMapDocument = useMapStore((store) => store.setMapDocument);

  const handleMapDocument = (data: DocumentObject) => {
    setMapDocument(data);
    const urlParams = new URLSearchParams(searchParams.toString());
    urlParams.set("document_id", data.document_id);
    router.push(pathname + "?" + urlParams.toString());
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
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button variant="outline">Recent</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-black/25 data-[state=open]:animate-overlayShow fixed inset-0" />
        <Dialog.Content className="data-[state=open]:animate-contentShow fixed top-[50%] left-[50%] max-h-[85vh] w-[90vw] max-w-[450px] translate-x-[-50%] translate-y-[-50%] rounded-[6px] bg-white p-[25px] shadow-[hsl(206_22%_7%_/_35%)_0px_10px_38px_-10px,_hsl(206_22%_7%_/_20%)_0px_10px_20px_-15px] focus:outline-none">
          <Dialog.Title className="m-0 font-medium">
            Recent Maps
          </Dialog.Title>
            {recentMaps.map((recentMap) => (
              <RecentMapsRow
                key={recentMap.document_id}
                data={recentMap}
                onSelect={handleMapDocument}
              />
            ))}
          <Dialog.Close asChild>
            <Button>
              <Cross2Icon />
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

const RecentMapsRow: React.FC<{
  data: DocumentObject;
  onSelect: (data: DocumentObject) => void;
}> = ({ data, onSelect }) => {
  const updatedDate =new Date(data.updated_at as string)
  const formattedData = updatedDate.toLocaleDateString()
  return (
    <Flex direction={"row"} gap="3" width="100%">
      <div className="pr-4">
        <Text>{data.gerrydb_table}</Text>
      </div>
      <div className="pr-4">
        <Text>{formattedData}</Text>
      </div>
      <div className="pr-4">
        <Text>{data.document_id.slice(0, 8)}...</Text>
      </div>

      <button onClick={() => onSelect(data)}>Load</button>
    </Flex>
  );
};
