import {useCallback, useMemo} from 'react';
import {useMapStore} from '@store/mapStore';
import {normalizeZoneOrder, zoneLabel} from '@utils/zoneLabels';

/** A district's label: its stored name, or its number by default. */
export const useZoneLabel = (zone: number) =>
  useMapStore(state => zoneLabel(zone, state.mapDocument?.map_metadata?.zone_aliases));

/** `(zone) => label`, for lists of districts. */
export const useZoneLabelGetter = () => {
  const aliases = useMapStore(state => state.mapDocument?.map_metadata?.zone_aliases);
  return useCallback((zone: number) => zoneLabel(zone, aliases), [aliases]);
};

/** District numbers in panel order (`map_metadata.zone_order`, cleaned). */
export const useZoneOrder = () => {
  const order = useMapStore(state => state.mapDocument?.map_metadata?.zone_order);
  const numDistricts = useMapStore(state => state.mapDocument?.num_districts ?? 0);
  return useMemo(() => normalizeZoneOrder(order, numDistricts), [order, numDistricts]);
};
