import {MapStore, useMapStore} from '@/app/store/mapStore';
import {Flex, Switch, Text} from '@radix-ui/themes';

const LAYER_OPTIONS: Array<{
  label: string;
  value: keyof MapStore['mapOptions']['activeLayers']
}> = [
  {
    label: 'Urban Areas',
    value: 'urban-areas',
  }
];

export const OverlaysMapPanel = () => {
  const activeLayers = useMapStore(state => state.mapOptions.activeLayers);
  const toggleLayer = useMapStore(state => state.toggleLayer);

  return (
    <Flex direction="column" gap="4">
      {LAYER_OPTIONS.map(layer => (
        <Flex key={layer.value} gapX="2" align="center">
          <Switch checked={activeLayers[layer.value]} onCheckedChange={() => toggleLayer(layer.value)} />
          <Text>{layer.label}</Text>
        </Flex>
      ))}
    </Flex>
  );
};
