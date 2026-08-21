import {useRef} from 'react';
import {useMapStore} from '@store/mapStore';
import {PUBLIC_SOURCE_ID} from '@/app/constants/map/layerIds';

export function useDistrictHover() {
  const getMapRef = useMapStore(state => state.getMapRef);
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
  };

  const onDistrictLeave = () => {
    const map = getMapRef();
    if (map) {
      prevRef.current.forEach(id =>
        map.setFeatureState({source: PUBLIC_SOURCE_ID, id}, {focused: false})
      );
    }
    prevRef.current = [];
  };

  return {onDistrictEnter, onDistrictLeave};
}
