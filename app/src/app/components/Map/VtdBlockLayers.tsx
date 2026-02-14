import {BLOCK_SOURCE_ID} from '@/app/constants/layers';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useLayoutEffect} from 'react';
import {useMap} from 'react-map-gl/maplibre';
import ZoneChildLayerGroup from './ZoneChildLayerGroup';
import ZoneParentLayerGroup from './ZoneParentLayerGroup';
import {DemographicLayer} from './DemographicLayer';
import {HoverLayerGroup} from './HoverLayerGroup';
import {demographyCache} from '@/app/utils/demography/demographyCache';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';

export function VtdBlockLayers({
  layerOrder,
  isDemographicMap = false,
}: {
  layerOrder: {
    assignmentLayerBeforeId: string;
    demographyLayerBeforeId: string;
    hoverLayerBeforeId: string;
  };
  isDemographicMap?: boolean;
}) {
  const mapDocument = useMapStore(state => state.mapDocument);
  const showDemographicMap = useMapControlsStore(state => state.mapOptions.showDemographicMap);
  const demographicVariable = useDemographyStore(state => state.variable);
  const demographicVariant = useDemographyStore(state => state.variant);
  const setScale = useDemographyStore(state => state.setScale);
  const demographyDataHash = useDemographyStore(state => state.dataHash);
  const shatterIds = useAssignmentsStore(state => state.shatterIds);
  const showDemography = isDemographicMap || showDemographicMap === 'overlay';
  const assignmentLayerBeforeId = layerOrder.assignmentLayerBeforeId;
  const demographyLayerBeforeId = layerOrder.demographyLayerBeforeId;
  const hoverLayerBeforeId = layerOrder.hoverLayerBeforeId;
  const mapRef = useMap();
  const numberOfBins = useDemographyStore(state => state.numberOfBins);

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
    if (showDemography && mapDocument) {
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

  return (
    <>
      {!isDemographicMap && <ZoneChildLayerGroup layerBeforeId={assignmentLayerBeforeId} />}
      {!isDemographicMap && <ZoneParentLayerGroup layerBeforeId={assignmentLayerBeforeId} />}
      {!!showDemography && <DemographicLayer child layerBeforeId={demographyLayerBeforeId} />}
      {!!showDemography && <DemographicLayer layerBeforeId={demographyLayerBeforeId} />}

      <HoverLayerGroup layerBeforeId={hoverLayerBeforeId} />
      <HoverLayerGroup child layerBeforeId={hoverLayerBeforeId} />
    </>
  );
}
