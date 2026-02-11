import { Box, Text, Checkbox, Flex, Switch } from '@radix-ui/themes';
import { useMapStore } from '@/app/store/mapStore';
import { useMapControlsStore } from '@/app/store/mapControlsStore';
import { useOverlayStore } from '@/app/store/overlayStore';
import { getFeaturesInBbox } from '@utils/map/getFeaturesInBbox';
import { getFeaturesIntersectingCounties } from '@utils/map/getFeaturesIntersectingCounties';

export default function PaintCommunity() {
  const mapRef = useMapStore(state => state.getMapRef());
  const setPaintFunction = useMapControlsStore(state => state.setPaintFunction);
  const paintCommunity = useMapControlsStore(state => state.mapOptions.paintCommunity);
  const paintByCounty = useMapControlsStore(state => state.mapOptions.paintByCounty);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const access = useMapStore(state => state.mapStatus?.access);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);

  const handleToggle = () => {
    if (!mapRef) return;
    const nextPaintCommunity = !paintCommunity;
    setMapOptions(
      nextPaintCommunity
        ? {
            paintCommunity: true,
            // When entering community mode, always render community layers.
            showCommunities: true,
          }
        : {
            // Leaving community mode should not change global community visibility.
            paintCommunity: false,
            // Ensure district fills are visible when returning to district mode.
            showPaintedDistricts: true,
          }
    );

    if (!paintCommunity) {
      // Clear overlay constraint when enabling community paint
      clearPaintConstraint();
    }
    if (!paintByCounty) {
      // Clear overlay constraint when enabling county paint
      // NOTE: Peter: This secondary clear paint might cause issues
      clearPaintConstraint();
      setPaintFunction(getFeaturesInBbox);
    } else {
      setPaintFunction(getFeaturesIntersectingCounties);
    }
  };

  return (
    <Text as="label" size="1">
      <Flex gap="1" direction="column" justify="center">
        <Flex justify="center">
          <Switch
            size="1"
            checked={paintCommunity}
            defaultChecked={false}
            onClick={handleToggle}
            disabled={access === 'read'}
          />
          {''}
        </Flex>
        <Text size="1"> Community Mode </Text>
      </Flex>
    </Text>
  );
}
