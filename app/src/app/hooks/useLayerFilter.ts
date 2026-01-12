import {useMemo} from 'react';
import {FilterSpecification} from 'maplibre-gl';
import {useAssignmentsStore} from '../store/assignmentsStore';

export const useLayerFilter = (child: boolean) => {
  // Convert Set to array in selector to ensure Zustand tracks changes properly
  // Sets are compared by reference, so we need to convert to array for proper reactivity
  const idsArray = useAssignmentsStore(state => 
    Array.from(child ? state.shatterIds.children : state.shatterIds.parents)
  );

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
