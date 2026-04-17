import {useMemo} from 'react';
import {FilterSpecification} from 'maplibre-gl';
import {useAssignmentsStore} from '../store/assignmentsStore';
import {useCoiAssignmentsStore} from '../store/coiAssignmentsStore';
import {useMapControlsStore} from '../store/mapControlsStore';
import {MAP_MODES} from '@constants/map/mode';

/**
 * Shallow array equality check for Zustand selector.
 * Prevents unnecessary re-renders when array contents haven't changed.
 */
const arrayEquals = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export const useLayerFilter = (child: boolean) => {
  const mapMode = useMapControlsStore(state => state.mapMode);

  // Convert Set to array in selector to ensure Zustand tracks changes properly.
  const districtIdsArray = useAssignmentsStore(
    state => Array.from(child ? state.shatterIds.children : state.shatterIds.parents),
    arrayEquals
  );
  const coiIdsArray = useCoiAssignmentsStore(
    state => Array.from(child ? state.shatterIds.children : state.shatterIds.parents),
    arrayEquals
  );
  const idsArray = mapMode === MAP_MODES.COI ? coiIdsArray : districtIdsArray;

  const layerFilter = useMemo(() => {
    // For child layers: show only children (match IDs in the set)
    // For parent layers: show only non-shattered parents (exclude IDs in the set)
    const filterBase =
      idsArray.length > 0
        ? ['match', ['get', 'path'], idsArray, true, false]
        : // nothing will ever match "__never__"
          ['==', ['get', 'path'], '__never__'];

    return child ? filterBase : ['!', filterBase];
  }, [idsArray, child]);

  return layerFilter as FilterSpecification;
};
