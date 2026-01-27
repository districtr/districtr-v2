'use client';
import {Flex, Text, Switch, Spinner} from '@radix-ui/themes';
import {useOverlayStore} from '@/app/store/overlayStore';
import { fastUniqBy } from '@/app/utils/arrays';
import { useMemo } from 'react';

export const OverlaysPanel = () => {
  const availableOverlays = useOverlayStore(state => state.availableOverlays);
  const enabledOverlayIds = useOverlayStore(state => state.enabledOverlayIds);
  const toggleOverlay = useOverlayStore(state => state.toggleOverlay);
  const isLoading = useOverlayStore(state => state.isLoading);
  const uniqueOverlays = useMemo(() => {
    const sortedOverlays = availableOverlays.sort((a, b) => {
      if (a.name === b.name) {
        return a.layer_type.localeCompare(b.layer_type);
      }
      return a.name.localeCompare(b.name);
    });
    return fastUniqBy(sortedOverlays, 'name');
  }, [availableOverlays]);

  if (isLoading) {
    return (
      <Flex direction="column" justify="center" align="center" p="4">
        <Spinner />
        <Text size="2" className="ml-2">
          Loading overlays...
        </Text>
      </Flex>
    );
  }

  if (availableOverlays.length === 0) {
    return (
      <Text color="gray" size="2">
        No overlay layers configured for this map.
      </Text>
    );
  }

  return (
    <Flex gap="3" direction="column">
      {uniqueOverlays.map(overlay => (
        <Flex key={overlay.overlay_id} justify="between" align="center" gap="2">
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              {overlay.name}
            </Text>
            {overlay.description && (
              <Text size="1" color="gray">
                {overlay.description}
              </Text>
            )}
          </Flex>
          <Switch
            checked={enabledOverlayIds.has(overlay.name)}
            onCheckedChange={() => toggleOverlay(overlay.name)}
          />
        </Flex>
      ))}
    </Flex>
  );
};

export default OverlaysPanel;
