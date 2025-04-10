import {Box, Text, Checkbox, Flex} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {getFeaturesInBbox, getFeaturesIntersectingCounties} from '../../utils/helpers';

export default function PaintByCounty() {
  const mapRef = useMapStore(state => state.getMapRef());
  const setPaintFunction = useMapStore(state => state.setPaintFunction);
  const paintByCounty = useMapStore(state => state.mapOptions.paintByCounty);
  const setMapOptions = useMapStore(state => state.setMapOptions);

  const handleToggle = () => {
    if (!mapRef) return;
    setMapOptions({
      paintByCounty: !paintByCounty,
    });
    if (!paintByCounty) {
      setPaintFunction(getFeaturesIntersectingCounties);
    } else {
      setPaintFunction(getFeaturesInBbox);
    }
  };

  return (
    <Box pb="3">
      <Text as="label" size="2">
        <Flex gap="2">
          <Checkbox checked={paintByCounty} defaultChecked={false} onClick={handleToggle} />
          Paint by County
        </Flex>
      </Text>
    </Box>
  );
}
