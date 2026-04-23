import {useCallback} from 'react';
import {colorScheme as DefaultColorScheme} from '@/app/constants/colors';
import {NullableZone} from '@/app/constants/types';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useMapStore} from '@/app/store/mapStore';
import {getCommunityColor} from '@/app/utils/communities';

export const useZoneColorGetter = () => {
  const mapMode = useMapControlsStore(state => state.mapMode);
  const colorScheme = useMapStore(state => state.mapDocument?.color_scheme ?? DefaultColorScheme);
  const communities = useMapStore(state => state.communities);

  return useCallback(
    (zone: NullableZone, fallbackColor = '#000000') => {
      if (zone === null) return fallbackColor;
      if (mapMode === 'coi') {
        return getCommunityColor(communities, zone, fallbackColor);
      }
      return colorScheme[(zone - 1) % colorScheme.length] ?? fallbackColor;
    },
    [communities, colorScheme, mapMode]
  );
};
