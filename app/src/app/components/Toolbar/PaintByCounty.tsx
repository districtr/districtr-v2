import {Card, Checkbox, Flex, Text, Tooltip} from '@radix-ui/themes';
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
    <Tooltip content="Paint whole counties at a time">
      <Card size="1" className={paintByCounty ? 'bg-indigo-50' : ''}>
        <Text as="label" size="2" className="cursor-pointer select-none">
          <Flex gap="2" align="center">
            <Checkbox
              checked={paintByCounty}
              onCheckedChange={handleToggle}
              disabled={access === ACCESS_STATES.READ}
            />
            County Brush
          </Flex>
        </Text>
      </Card>
    </Tooltip>
  );
}
