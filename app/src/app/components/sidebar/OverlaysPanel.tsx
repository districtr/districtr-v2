'use client';
import {Flex, Text, Switch, Spinner, Button, Callout} from '@radix-ui/themes';
import {CrossCircledIcon, TargetIcon} from '@radix-ui/react-icons';
import {useOverlayStore} from '@/app/store/overlayStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {getFeaturesInBbox} from '@utils/map/getFeaturesInBbox';

export const OverlaysPanel = () => {
  const availableOverlays = useOverlayStore(state => state.availableOverlays);
  const enabledOverlayIds = useOverlayStore(state => state.enabledOverlayIds);
  const toggleOverlay = useOverlayStore(state => state.toggleOverlay);
  const isLoading = useOverlayStore(state => state.isLoading);
  const paintConstraint = useOverlayStore(state => state.paintConstraint);
  const selectOverlayFeature = useOverlayStore(state => state.selectOverlayFeature);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);
  const setPaintFunction = useMapControlsStore(state => state.setPaintFunction);

  const handleLocateClick = (overlayId: string) => {
    selectOverlayFeature(overlayId);
  };

  const handleReleaseConstraint = () => {
    clearPaintConstraint();
    setPaintFunction(getFeaturesInBbox);
  };

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
      {paintConstraint && (
        <Callout.Root color="orange" size="1">
          <Callout.Icon>
            <TargetIcon />
          </Callout.Icon>
          <Callout.Text>
            <Flex justify="between" align="center" gap="2">
              <Text size="1">Paint constrained to: {paintConstraint.featureName}</Text>
              <Button size="1" variant="ghost" color="orange" onClick={handleReleaseConstraint}>
                <CrossCircledIcon />
                Release
              </Button>
            </Flex>
          </Callout.Text>
        </Callout.Root>
      )}

      {/* {constraintSelectionMode && (
        <Callout.Root color="blue" size="1">
          <Callout.Icon>
            <TargetIcon />
          </Callout.Icon>
          <Callout.Text>
            <Flex justify="between" align="center" gap="2">
              <Text size="1">Click an overlay feature on the map to constrain painting</Text>
              <Button size="1" variant="ghost" color="blue" onClick={handleCancelSelection}>
                Cancel
              </Button>
            </Flex>
          </Callout.Text>
        </Callout.Root>
      )} */}

      {availableOverlays.map(overlay => {
        const isEnabled = enabledOverlayIds.has(overlay.overlay_id);
        const hasConstraint = paintConstraint?.overlayId === overlay.overlay_id;

        return (
          <Flex key={overlay.overlay_id} justify="between" align="center" gap="2">
            <Flex direction="column" gap="1" style={{flex: 1}}>
              <Text size="2" weight="medium">
                {overlay.name}
              </Text>
              {overlay.description && (
                <Text size="1" color="gray">
                  {overlay.description}
                </Text>
              )}
              {isEnabled && (
                <Flex gap="1" mt="1">
                  {hasConstraint ? (
                    <Button
                      size="1"
                      variant="soft"
                      color="orange"
                      onClick={handleReleaseConstraint}
                    >
                      <CrossCircledIcon />
                      Release Constraint
                    </Button>
                  ) : (
                    <Button
                      size="1"
                      variant="soft"
                      color="blue"
                      onClick={() => handleLocateClick(overlay.overlay_id)}
                    >
                      <TargetIcon />
                      Locate
                    </Button>
                  )}
                </Flex>
              )}
            </Flex>
            <Switch
              checked={isEnabled}
              onCheckedChange={() => toggleOverlay(overlay.overlay_id)}
            />
          </Flex>
        );
      })}
    </Flex>
  );
};

export default OverlaysPanel;
