import React from "react";
import { ContextMenu, Text } from "@radix-ui/themes";
import { useMapStore } from "@/app/store/mapStore";
import { useMutation } from "@tanstack/react-query";
import { patchShatterParents } from "@api/apiHandlers";

export const MapContextMenu: React.FC = () => {
  const { mapDocument, contextMenu } = useMapStore((state) => {
    return {
      mapDocument: state.mapDocument,
      contextMenu: state.contextMenu,
    };
  });
  const patchShatter = useMutation({
    mutationFn: patchShatterParents,
    onMutate: ({ document_id, geoids }) => {
      console.log(
        `Shattering parents for ${geoids} in document ${document_id}...`,
      );
    },
    onError: (error) => {
      console.log("Error updating assignments: ", error);
    },
    onSuccess: (data) => {
      console.log(`Successfully shattered parents into: ${data}`);
    },
  });

  if (!contextMenu) return null;

  const handleShatter = () => {
    if (!mapDocument || contextMenu?.data?.id === undefined) return;
    patchShatter.mutate({
      document_id: mapDocument.document_id,
      geoids: [contextMenu.data.id.toString()],
    });
    contextMenu.close();
  };

  return (
    <ContextMenu.Root onOpenChange={contextMenu.close}>
      <ContextMenu.Content
        size="2"
        forceMount={true}
        onEscapeKeyDown={contextMenu.close}
        onInteractOutside={contextMenu.close}
        onPointerDownOutside={contextMenu.close}
        // This *could* be hanlded more elegantly, but doing it this way
        // isolates events in the context menu from the map pretty nicely
        // also, if in the future we need the context menu outside of the map,
        // this sets us up to do that
        style={{
          position: "fixed",
          top: contextMenu.y,
          left: contextMenu.x,
        }}
      >
        {contextMenu.data.id && (
          <ContextMenu.Label>
            <Text size="1" color="gray">
              {contextMenu.data.id}
            </Text>
          </ContextMenu.Label>
        )}
        <ContextMenu.Item onClick={handleShatter}>Shatter</ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
};
