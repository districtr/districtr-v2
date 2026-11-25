import {useCallback, useEffect} from 'react';
import {useMapStore} from '@store/mapStore';

/**
 * Highlights districts on the map from the evaluation panel. The store's list is
 * the only record of the highlight, shared by every section: an enter replaces the
 * whole list and a leave empties it, whichever section set it.
 */
export function useDistrictHover() {
  const setHoveredZones = useMapStore(state => state.setHoveredPublicZones);

  // Accepts one or several districts — highlighting a single district is
  // just the one-element case, so callers pass an array either way. A label
  // names the group on the map (see DistrictHighlightLabel).
  const onDistrictEnter = useCallback(
    (zones: (number | string)[], label?: string) => setHoveredZones(zones.map(String), label),
    [setHoveredZones]
  );

  const onDistrictLeave = useCallback(() => setHoveredZones([]), [setHoveredZones]);

  // The calling component can unmount while a trigger is still hovered or
  // focused (no leave/blur event fires for an element removed from the DOM),
  // so clear the highlight on unmount as well.
  useEffect(() => onDistrictLeave, [onDistrictLeave]);

  return {onDistrictEnter, onDistrictLeave};
}
