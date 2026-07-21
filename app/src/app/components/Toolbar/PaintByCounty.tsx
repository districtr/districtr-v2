import {Box, Text, Checkbox, Flex, Switch} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useOverlayStore} from '@/app/store/overlayStore';
import {getFeaturesInBbox} from '@utils/map/getFeaturesInBbox';
import {getFeaturesIntersectingCounties} from '@utils/map/getFeaturesIntersectingCounties';
import {ACCESS_STATES} from '@constants/document/state';

export default function PaintByCounty() {
  const mapRef = useMapStore(state => state.getMapRef());
  const setPaintFunction = useMapControlsStore(state => state.setPaintFunction);
  const paintByCounty = useMapControlsStore(state => state.mapOptions.paintByCounty);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const access = useMapStore(state => state.mapStatus?.access);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);

  const handleToggle = () => {
    if (!mapRef) return;
    setMapOptions({
      paintByCounty: !paintByCounty,
    });
    if (!paintByCounty) {
      // Clear overlay constraint when enabling county paint
      clearPaintConstraint();
      setPaintFunction(getFeaturesIntersectingCounties);
    } else {
      setPaintFunction(getFeaturesInBbox);
    }
  };

  return (
    <Text as="label" size="2">
      <Flex gap="1" direction="column">
        County Brush
        <Switch
          size="2"
          checked={paintByCounty}
          defaultChecked={false}
          onClick={handleToggle}
          disabled={access === ACCESS_STATES.READ}
          radius="small"
          // ponytail: unchecked track uses --gray-a3/a5; bump locally for a more visible passive state
          style={{'--gray-a3': 'var(--gray-a6)', '--gray-a5': 'var(--gray-a8)'} as React.CSSProperties}
        />{' '}
      </Flex>
    </Text>
  );
}
