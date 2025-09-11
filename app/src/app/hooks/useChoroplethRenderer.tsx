import {useLayoutEffect} from 'react';
import {demographyCache} from '../utils/demography/demographyCache';
import {useDemographyStore} from '../store/demography/demographyStore';
import {useMapStore} from '../store/mapStore';
import {BLOCK_SOURCE_ID} from '../constants/layers';
import { useMap } from 'react-map-gl/maplibre';

export const useChoroplethRenderer = () => {
  const mapRef = useMap();
  const demographicVariable = useDemographyStore(state => state.variable);
  const demographicVariant = useDemographyStore(state => state.variant);
  const mapDocument = useMapStore(state => state.mapDocument);
  const setScale = useDemographyStore(state => state.setScale);
  const showDemography = useMapStore(state => state.mapOptions.showDemographicMap);
  const numberOfBins = useDemographyStore(state => state.numberOfBins);
  const demographyDataHash = useDemographyStore(state => state.dataHash);
  const shatterIds = useMapStore(state => state.shatterIds);

  const handleChoroplethRender = ({numberOfBins}: {numberOfBins?: number}) => {
    const _map = mapRef.current?.getMap();
    if (_map) {
      const updateFn = () => {
        const mapScale = demographyCache.calculateDemographyColorScale({
          variable: demographicVariable,
          variant: demographicVariant,
          mapRef: _map,
          mapDocument,
          numberOfBins: numberOfBins || 5,
          paintMap: true,
        });
        mapScale && setScale(mapScale);
        return mapScale;
      };
      // handle asynchronous map / source loads
      if (_map?.getSource(BLOCK_SOURCE_ID)) {
        return updateFn();
      } else {
        _map.on('load', () => {
          const r = updateFn();
          if (r) {
            _map.off('load', updateFn);
          }
        });
      }
    }
    return false;
  };

  useLayoutEffect(() => {
    if (showDemography) {
      handleChoroplethRender({numberOfBins});
    }
  }, [
    numberOfBins,
    showDemography,
    demographicVariable,
    demographyDataHash,
    shatterIds,
    mapDocument,
    demographicVariant,
  ]);
};
