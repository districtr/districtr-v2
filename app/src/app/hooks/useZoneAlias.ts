import {useMapStore} from '@store/mapStore';

/** The user-set display name for a district, if any. */
export const useZoneAlias = (zone: number | null | undefined) =>
  useMapStore(state =>
    zone == null ? undefined : state.mapDocument?.map_metadata?.zone_aliases?.[zone]
  );
