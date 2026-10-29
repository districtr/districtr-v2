import {useMemo} from 'react';
import {getMaskOverlayId} from '@store/overlayStore';
import {useMapStore} from '@store/mapStore';
import {useIsSingleCounty} from '@/app/hooks/useIsSingleCounty';
import {COUNTY_SOURCE_ID} from '@constants/map/layerIds';

/** Layers a paint mask can be drawn from: Counties (multi-county maps) and
 * each boundary group with a clickable line overlay. Paint by overlay
 * area uses the same list, minus Counties (which has its own brush). */
export const useMaskLayers = () => {
  const overlays = useMapStore(state => state.mapDocument?.overlays);
  const isSingleCounty = useIsSingleCounty();
  return useMemo(() => {
    const names = [...new Set((overlays ?? []).map(o => o.name))].sort();
    return [
      ...(isSingleCounty ? [] : [{id: COUNTY_SOURCE_ID, name: 'Counties'}]),
      ...names.flatMap(name => {
        const id = getMaskOverlayId(overlays ?? [], name);
        return id ? [{id, name}] : [];
      }),
    ];
  }, [overlays, isSingleCounty]);
};
