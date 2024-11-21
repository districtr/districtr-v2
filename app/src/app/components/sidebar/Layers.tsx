import {Heading, CheckboxGroup, Flex} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {
  COUNTY_LAYER_IDS,
  BLOCK_LAYER_ID,
  BLOCK_HOVER_LAYER_ID,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_LAYER_ID_CHILD,
} from '../../constants/layers';
import {toggleLayerVisibility} from '../../utils/helpers';

/** Layers
 * This component is responsible for rendering the layers that can be toggled
 * on and off in the map.
 *
 * TODO:
 * - Support numbering for painted districts
 * - Support tribes and communities
 */
export default function Layers() {
  const mapRef = useMapStore(state => state.getMapRef());
  const mapDocument = useMapStore(state => state.mapDocument);
  const visibleLayerIds = useMapStore(state => state.visibleLayerIds);
  const updateVisibleLayerIds = useMapStore(state => state.updateVisibleLayerIds);
  const toggleHighlightBrokenDistricts = useMapStore(state => state.toggleHighlightBrokenDistricts);
  const toggleLockAllAreas = useMapStore(state => state.toggleLockAllAreas);
  const parentsAreBroken = useMapStore(state => state.shatterIds.parents.size);
  const mapOptions = useMapStore(state => state.mapOptions);
  const setMapOptions = useMapStore(state => state.setMapOptions);

  const toggleLayers = (layerIds: string[]) => {
    if (!mapRef) return;
    const layerUpdates = toggleLayerVisibility(mapRef, layerIds);
    updateVisibleLayerIds(layerUpdates);
  };

  return (
    <Flex gap="3" direction="column">
      <Heading as="h3" weight="bold" size="3">
        My painted districts
      </Heading>
      <CheckboxGroup.Root
        defaultValue={[]}
        name="districts"
        value={[
          visibleLayerIds.includes(BLOCK_LAYER_ID) ? '1' : '',
          mapOptions.showZoneNumbers ? '2' : '',
          parentsAreBroken && mapOptions.showBrokenDistricts ? '3' : '',
          mapOptions.lockPaintedAreas === true ? '4' : '',
          mapOptions.higlightUnassigned === true ? 'higlightUnassigned' : ''
        ]}
      >
        <CheckboxGroup.Item
          value="1"
          onClick={() =>
            toggleLayers([
              BLOCK_LAYER_ID,
              BLOCK_HOVER_LAYER_ID,
              BLOCK_HOVER_LAYER_ID_CHILD,
              BLOCK_LAYER_ID_CHILD,
            ])
          }
          disabled={mapDocument === null}
        >
          Show painted districts
        </CheckboxGroup.Item>
        <CheckboxGroup.Item value="2" onClick={() => setMapOptions({
          showZoneNumbers: !mapOptions.showZoneNumbers
        })}>
          Show numbering for painted districts <i>(experimental)</i>
        </CheckboxGroup.Item>
        <CheckboxGroup.Item
          value="3"
          disabled={!parentsAreBroken}
          onClick={() => toggleHighlightBrokenDistricts()}
        >
          Highlight broken precincts
        </CheckboxGroup.Item>
        <CheckboxGroup.Item value="higlightUnassigned" onClick={() => setMapOptions({
          higlightUnassigned: !mapOptions.higlightUnassigned
        })}>
          Highlight unassigned units
        </CheckboxGroup.Item>
        <CheckboxGroup.Item value="4" onClick={() => toggleLockAllAreas()}>
          Lock All Painted Areas
        </CheckboxGroup.Item>
      </CheckboxGroup.Root>
      <Heading as="h3" weight="bold" size="3">
        Boundaries
      </Heading>
      <CheckboxGroup.Root
        name="contextualLayers"
        value={COUNTY_LAYER_IDS.every(layerId => visibleLayerIds.includes(layerId)) ? ['1'] : []}
      >
        <CheckboxGroup.Item value="1" onClick={() => toggleLayers(COUNTY_LAYER_IDS)}>
          Show county boundaries
        </CheckboxGroup.Item>
        <CheckboxGroup.Item value="2" disabled>
          Show tribes and communities
        </CheckboxGroup.Item>
      </CheckboxGroup.Root>
    </Flex>
  );
}
