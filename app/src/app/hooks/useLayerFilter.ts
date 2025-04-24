import {useMemo} from 'react';
import {useMapStore} from '../store/mapStore';
import {FilterSpecification} from 'maplibre-gl';

export const useLayerFilter = (child: boolean) => {
  const shatterIds = useMapStore(state => state.shatterIds);

  const layerFilter = useMemo(() => {
    const ids = child ? shatterIds.children : shatterIds.parents;
    const cleanIds = Boolean(ids) ? Array.from(ids) : [];
    const filterBase =
      cleanIds.length > 0
        ? ['match', ['get', 'path'], cleanIds, true, false]
        : // nothing will ever match "__never__"
          ['==', ['get', 'path'], '__never__'];
    return child ? filterBase : ['!', filterBase];
  }, [shatterIds, child]);

  return layerFilter as FilterSpecification;
};
