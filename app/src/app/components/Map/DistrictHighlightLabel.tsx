'use client';
import {useMapStore} from '@/app/store/mapStore';
import {MapPill} from './MapPill';

/**
 * Names, in a pill at the top of the map, the group of districts the evaluation panel
 * highlights, so the map says by itself what its highlight shows.
 */
export const DistrictHighlightLabel = () => {
  const label = useMapStore(state => state.hoveredPublicZonesLabel);
  if (!label) return null;
  return <MapPill placement="top">{label}</MapPill>;
};
