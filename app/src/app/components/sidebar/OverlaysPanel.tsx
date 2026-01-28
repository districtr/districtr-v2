'use client';
import {Flex, Text, Switch, Spinner} from '@radix-ui/themes';
import {useOverlayStore} from '@/app/store/overlayStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import { fastUniqBy } from '@/app/utils/arrays';
import { useMemo } from 'react';

export const OverlaysPanel = () => {
  const availableOverlays = useOverlayStore(state => state.availableOverlays);
  const enabledOverlayIds = useOverlayStore(state => state.enabledOverlayIds);
  const toggleOverlay = useOverlayStore(state => state.toggleOverlay);
  const isLoading = useOverlayStore(state => state.isLoading);
  const mapOptions = useMapControlsStore(state => state.mapOptions);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  
  const uniqueOverlays = useMemo(() => {
    const sortedOverlays = availableOverlays.sort((a, b) => {
      if (a.name === b.name) {
        return a.layer_type.localeCompare(b.layer_type);
      }
      return a.name.localeCompare(b.name);
    });
    return fastUniqBy(sortedOverlays, 'name');
  }, [availableOverlays]);

  const hasOverlays = availableOverlays.length > 0;

  return (
    <Flex gap="3" direction="column">
      {/* County Layer Controls - Always shown as pseudo-overlay */}
      <Flex justify="between" align="center" gap="2">
        <Flex direction="column" gap="1">
          <Text size="2" weight="medium">
            County Boundaries
          </Text>
          <Text size="1" color="gray">
            Show county boundaries and labels
          </Text>
        </Flex>
        <Switch
          checked={mapOptions.showCountyBoundaries ?? false}
          onCheckedChange={(checked) =>
            setMapOptions({showCountyBoundaries: checked})
          }
        />
      </Flex>
      
      <Flex justify="between" align="center" gap="2">
        <Flex direction="column" gap="1">
          <Text size="2" weight="medium">
            Emphasize County Names
          </Text>
          <Text size="1" color="gray">
            Make county names more prominent
          </Text>
        </Flex>
        <Switch
          checked={mapOptions.prominentCountyNames ?? false}
          onCheckedChange={(checked) =>
            setMapOptions({prominentCountyNames: checked})
          }
        />
      </Flex>

      {/* Regular Overlay Layers */}
      {isLoading ? (
        <Flex direction="column" justify="center" align="center" p="4">
          <Spinner />
          <Text size="2" className="ml-2">
            Loading overlays...
          </Text>
        </Flex>
      ) : hasOverlays ? (
        uniqueOverlays.map(overlay => (
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
        ))
      ) : null}
      
      {!isLoading && !hasOverlays && (
        <Text color="gray" size="2" mt="2">
          No additional overlay layers configured for this map.
        </Text>
      )}
    </Flex>
  );
};

export default OverlaysPanel;
