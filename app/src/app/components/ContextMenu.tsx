import React from "react";
import { ContextMenu, Text } from "@radix-ui/themes";
import { useMapStore } from "@/app/store/mapStore";
import { PARENT_LAYERS } from "../constants/layers";

export const MapContextMenu: React.FC = () => {
  const mapDocument = useMapStore((state) => state.mapDocument);
  const contextMenu = useMapStore((state) => state.contextMenu);
  const handleShatter = useMapStore((state) => state.handleShatter);
  const lockedFeatures = useMapStore((state) => state.lockedFeatures);
  const upcertLockedFeature = useMapStore((state) => state.upcertLockedFeature);

  const canShatter = Boolean(
    mapDocument?.parent_layer &&
      mapDocument.child_layer &&
      mapDocument.child_layer !== contextMenu?.data.sourceLayer
  );

  if (!contextMenu) return null;
  const id = contextMenu.data.id?.toString() || "";
  const featureIsLocked = lockedFeatures.has(id);

  const handleSelect = () => {
    if (!mapDocument || contextMenu?.data?.id === undefined) return;
    handleShatter(mapDocument.document_id, [contextMenu.data]);
    contextMenu.close();
  };
  const handleLock = () => {
    upcertLockedFeature(id, !featureIsLocked);
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
          position: 'fixed',
          top: contextMenu.y,
          left: contextMenu.x,
        }}
      >
        <ContextMenu.Label>
          <Text size="1" color="gray">
            {id}
          </Text>
        </ContextMenu.Label>
        <ContextMenu.Item disabled={!canShatter} onSelect={handleSelect}>
        {contextMenu.data.id && (
          <ContextMenu.Label>
            <Text size="1" color="gray">
              {contextMenu.data.id}
            </Text>
          </ContextMenu.Label>
        )}
        </ContextMenu.Item>
        <ContextMenu.Item disabled={!mapDocument?.child_layer} onSelect={handleSelect}>
          Shatter
        </ContextMenu.Item>
        <ContextMenu.Item onSelect={handleLock}>
          {featureIsLocked ? "Unlock" : "Lock"}
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
};
