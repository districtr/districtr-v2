import {
  PARENT_LAYERS,
  CHILD_LAYERS,
  getLayerFill,
  COUNTY_LAYERS,
} from '../constants/layers';
import {
  ColorZoneAssignmentsState,
  colorZoneAssignments,
  shallowCompareArray,
} from '../utils/helpers';
import {useMapStore as _useMapStore, MapStore} from '@store/mapStore';

export const getRenderSubscriptions = (useMapStore: typeof _useMapStore) => {
  const updateFeatureState = useMapStore.subscribe(state => state.updated,
    (updated) => {
      const {featureState, getMapRef, mapDocument} = useMapStore.getState()
      const mapRef = getMapRef()
      if (!mapRef || !mapDocument) return
      Object.entries(updated).forEach(([sourceLayer, idArray]) => {
        idArray.forEach(id => {
          mapRef.style.sourceCaches[mapDocument.gerrydb_table]._state.updateState(
            sourceLayer,
            id,
            featureState[sourceLayer][id]
          )
        })
      })
      mapRef.redraw()
    }
  )


  const filterCountiesSub = useMapStore.subscribe<[string | undefined, MapStore['getMapRef']]>(
    state => [state.mapOptions.currentStateFp, state.getMapRef],
    ([stateFp, getMapRef]) => {
      const mapRef = getMapRef();
      if (!mapRef) return;
      const filterExpression = (stateFp ? ['==', 'STATEFP', stateFp] : true) as any;
      COUNTY_LAYERS.forEach(layer => {
        mapRef.getLayer(layer) && mapRef.setFilter(layer, ['any', filterExpression]);
      });
    }
  );

  return [filterCountiesSub];
};
