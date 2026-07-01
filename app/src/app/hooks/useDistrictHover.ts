import {useRef} from 'react';
import {useMapStore} from '@store/mapStore';
import {PUBLIC_SOURCE_ID} from '@/app/constants/map/layerIds';

export function useDistrictHover() {
  const getMapRef = useMapStore(state => state.getMapRef);
  const prevRef = useRef<string | null>(null);

  const onDistrictEnter = (zone: number | string) => {
    const id = String(zone);
    const map = getMapRef();
    if (!map) return;
    if (prevRef.current)
      map.setFeatureState({source: PUBLIC_SOURCE_ID, id: prevRef.current}, {focused: false});
    map.setFeatureState({source: PUBLIC_SOURCE_ID, id}, {focused: true});
    prevRef.current = id;
  };

  const onDistrictLeave = () => {
    const map = getMapRef();
    if (map && prevRef.current)
      map.setFeatureState({source: PUBLIC_SOURCE_ID, id: prevRef.current}, {focused: false});
    prevRef.current = null;
  };

  return {onDistrictEnter, onDistrictLeave};
}
