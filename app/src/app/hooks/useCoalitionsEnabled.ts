import {useToolbarStore} from '@store/toolbarStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {MAP_MODES} from '@constants/map/mode';

/** Coalitions are a Super Draw feature for districts, but always available on
 * community (COI) maps, where coalition-building is the point. */
export const useCoalitionsEnabled = () => {
  const superDraw = useToolbarStore(state => state.superDraw);
  const mapMode = useMapControlsStore(state => state.mapMode);
  return superDraw || mapMode === MAP_MODES.COI;
};
