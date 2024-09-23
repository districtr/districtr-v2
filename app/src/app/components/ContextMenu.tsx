import React from "react";
import { ContextMenu, Text, Portal } from "@radix-ui/themes";
import { useMapStore } from "@/app/store/mapStore";

export const MapContextMenu: React.FC = () => {
  const contextMenu = useMapStore((state) => state.contextMenu);

  if (!contextMenu) return null;

  const handleShatter = () => {
    // TODO: shatter stuff
    contextMenu.close();
  };

  return (
    <ContextMenu.Root onOpenChange={contextMenu.close}>
      <ContextMenu.Content
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
              ID: {contextMenu.data.id}
            </Text>
          </ContextMenu.Label>
        )}
        <ContextMenu.Separator />
        <ContextMenu.Item>
          <ContextMenu.Item onClick={handleShatter}>Shatter</ContextMenu.Item>
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
};
