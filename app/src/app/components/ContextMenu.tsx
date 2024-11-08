import React from 'react';
import {ContextMenu, Text} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {CHILD_LAYERS, PARENT_LAYERS} from '../constants/layers';

export const MapContextMenu: React.FC = () => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const contextMenu = useMapStore(state => state.contextMenu);
  const handleShatter = useMapStore(state => state.handleShatter);
  const lockedFeatures = useMapStore(state => state.lockedFeatures);
  const lockFeature = useMapStore(state => state.lockFeature);
  const shatterMappings = useMapStore(state => state.shatterMappings);

  const canShatter = Boolean(
    mapDocument?.parent_layer &&
      mapDocument.child_layer &&
      mapDocument.child_layer !== contextMenu?.data.sourceLayer
  );

  if (!contextMenu) return null;
  const isChild = CHILD_LAYERS.includes(contextMenu.data.layer.id);
  const id = contextMenu.data.id?.toString() || '';
  const parent =
    (isChild &&
      Object.entries(shatterMappings).find(([key, value]) => {
        return value.has(id);
      })?.[0]) ||
    false;
  const shatterableId = isChild && parent ? parent : contextMenu?.data?.id;
  const featureIsLocked = lockedFeatures.has(id);

  const handleSelect = () => {
    if (!mapDocument || !shatterableId) return;
    const shatterData = isChild ? {id: shatterableId} : contextMenu.data;
    handleShatter(mapDocument.document_id, [shatterData]);
    contextMenu.close();
  };

  const handleLock = () => {
    lockFeature(id, !featureIsLocked);
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
        {!isChild && (
          <ContextMenu.Item disabled={!mapDocument?.child_layer} onSelect={handleSelect}>
            Break to Blocks
          </ContextMenu.Item>
        )}
        <ContextMenu.Item onSelect={handleLock}>
          {featureIsLocked ? 'Unlock' : 'Lock'}
        </ContextMenu.Item>

        {!!parent && (
          <>
            <ContextMenu.Label>
              <Text size="1" color="gray">
                Parent: {parent}
              </Text>
            </ContextMenu.Label>
            <ContextMenu.Item disabled={!mapDocument?.child_layer} onSelect={handleSelect}>
              Break Parent to Blocks
            </ContextMenu.Item>
          </>
        )}
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
};
