'use client';
import {Flex, Text, Switch, Spinner, Button, Callout, IconButton, Tooltip} from '@radix-ui/themes';
import {
  CrossCircledIcon,
  InfoCircledIcon,
  MaskOffIcon,
  MaskOnIcon,
  TargetIcon,
} from '@radix-ui/react-icons';
import {useOverlayStore} from '@/app/store/overlayStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {getFeaturesInBbox} from '@utils/map/getFeaturesInBbox';
import {fastUniqBy} from '@/app/utils/arrays';
import {useMemo} from 'react';
import {useMapStore} from '@/app/store/mapStore';

export const OverlaysPanel = () => {
  const availableOverlays = useMapStore(state => state.mapDocument?.overlays ?? []);
  const enabledOverlayIds = useOverlayStore(state => state.enabledOverlayIds);
  const toggleOverlay = useOverlayStore(state => state.toggleOverlay);
  const paintConstraint = useOverlayStore(state => state.paintConstraint);
  const selectOverlayFeature = useOverlayStore(state => state.selectOverlayFeature);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);
  const selectingLayerId = useOverlayStore(state => state.selectingLayerId);
  const handleLocateClick = (overlayId: string) => {
    selectOverlayFeature(overlayId);
  };

  const mapOptions = useMapControlsStore(state => state.mapOptions);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);

  // We want an easy way to make implicit map overlay groups, like outlines and labels.
  // We could make a construct to manage groupings of overlays, but that's a pain.
  // Instead, we just assume overlays with exactly the same name are part of the same group.
  // If admins want separately toggle-able overlays, don't name them the same.
  const overlaysGroupedByName = useMemo(() => {
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
      {paintConstraint && (
        <Button variant="outline" color="orange" onClick={clearPaintConstraint}>
          <Flex justify="between" align="center" gap="2">
            <Text size="2">Release paint mask</Text>
            <MaskOffIcon />
          </Flex>
        </Button>
      )}
      {!!(!paintConstraint && selectingLayerId) && (
        <Callout.Root color="violet" size="1" className="flex">
          <Flex justify="between" align="center" gap="2" className="mx-auto">
            <Callout.Icon>
              <TargetIcon className="animate-pulse" />
            </Callout.Icon>
            <Callout.Text>
              <Text size="2">You are selecting an area on the map to paint within.<br/> Click the map to select an area.</Text>
            </Callout.Text>
          </Flex>
        </Callout.Root>
      )}
      {/* County Layer Controls - Always shown as pseudo-overlay */}
      <Flex justify="between" align="center" gap="2">
        <Flex direction="column" gap="1">
          <Text size="2" weight="medium">
            County Boundaries and Labels
          </Text>
          <Text size="1" color="gray">
            Show county boundaries and labels
          </Text>
        </Flex>
        <Switch
          checked={mapOptions.showCountyBoundaries ?? false}
          onCheckedChange={checked =>
            setMapOptions({
              showCountyBoundaries: checked,
              prominentCountyNames: checked,
            })
          }
        />
      </Flex>
      {/* Regular Overlay Layers */}
      {hasOverlays
        ? overlaysGroupedByName.map(overlay => (
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
              <Flex direction="row" gap="2" align="center" justify="center">
                <Switch
                  checked={enabledOverlayIds.has(overlay.name)}
                  onCheckedChange={() => toggleOverlay(overlay.name)}
                />
                <Tooltip content="Choose an area to paint within.">
                  <IconButton
                    onClick={() => handleLocateClick(overlay.overlay_id)}
                    disabled={!enabledOverlayIds.has(overlay.name)}
                    variant="ghost"
                    color="blue"
                    size="1"
                    radius="full"
                    className="cursor-pointer"
                    style={{
                      opacity: enabledOverlayIds.has(overlay.name) ? 1 : 0.5,
                    }}
                  >
                    {paintConstraint?.overlayId === overlay.overlay_id ? (
                      <MaskOffIcon />
                    ) : (
                      <MaskOnIcon />
                    )}
                  </IconButton>
                </Tooltip>
              </Flex>
            </Flex>
          ))
        : null}
    </Flex>
  );
};

export default OverlaysPanel;
