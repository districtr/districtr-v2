import {Box, Text, Checkbox, Flex, Switch} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {getFeaturesInBbox, getFeaturesIntersectingCounties} from '../../utils/helpers';

export const PaintByCounty: React.FC<{label?: string}> = ({label = 'Paint counties'}) => {
  const mapRef = useMapStore(state => state.getMapRef());
  const setPaintFunction = useMapStore(state => state.setPaintFunction);
  const paintByCounty = useMapStore(state => state.mapOptions.paintByCounty);
  const setMapOptions = useMapStore(state => state.setMapOptions);
  const access = useMapStore(state => state.mapStatus?.access);

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
    <Text as="label" size="1">
      <Flex gap="1" direction="column">
        {label}
        <Switch
          size="1"
          checked={paintByCounty}
          defaultChecked={false}
          onClick={handleToggle}
          disabled={access === 'read'}
        />{' '}
      </Flex>
    </Text>
  );
};
