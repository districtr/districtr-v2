import {useCallback, useEffect, useRef} from 'react';
import {useMapStore} from '@store/mapStore';
import {PUBLIC_SOURCE_ID} from '@/app/constants/map/layerIds';

export function useDistrictHover() {
  const getMapRef = useMapStore(state => state.getMapRef);
  const setHoveredZones = useMapStore(state => state.setHoveredPublicZones);
  const prevRef = useRef<string[]>([]);

  // Accepts one or several districts — highlighting a single district is
  // just the one-element case, so callers pass an array either way.
  const onDistrictEnter = (zones: (number | string)[]) => {
    const map = getMapRef();
    if (!map) return;
    prevRef.current.forEach(id =>
      map.setFeatureState({source: PUBLIC_SOURCE_ID, id}, {focused: false})
    );
    const ids = zones.map(String);
    ids.forEach(id => map.setFeatureState({source: PUBLIC_SOURCE_ID, id}, {focused: true}));
    prevRef.current = ids;
    setHoveredZones(ids);
  };

  const onDistrictLeave = useCallback(() => {
    const map = getMapRef();
    if (map) {
      prevRef.current.forEach(id =>
        map.setFeatureState({source: PUBLIC_SOURCE_ID, id}, {focused: false})
      );
    }
    prevRef.current = [];
    setHoveredZones([]);
  }, [getMapRef, setHoveredZones]);

  // The calling component can unmount while a trigger is still hovered or
  // focused (no leave/blur event fires for an element removed from the DOM),
  // so clear the highlight and the store on unmount as well.
  useEffect(() => onDistrictLeave, [onDistrictLeave]);

  return {onDistrictEnter, onDistrictLeave};
}
