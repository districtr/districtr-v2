import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useToolbarStore} from '@store/toolbarStore';
import {useChartStore} from '@store/chartStore';
import {resolveFlag, useFeatureFlag, useFeatureFlagStore} from '@store/featureFlagStore';
import {getSiteSettings} from '@utils/api/siteSettings';
import {MAP_TYPES} from '@constants/document/types';
import {MAP_MODES} from '@constants/map/mode';
import type {MapType} from '@constants/document/types';
import type {MapMode} from '@constants/map/mode';

/**
 * Whether Super Draw's tuning view is open on a district map: DistrictMeters'
 * condition (Super Draw, the tuningView flag, the meters' toggle), and the
 * district save. While it is, saves bring back contiguity and autosave runs
 * sooner. useTuningView re-renders on a change; isTuningViewOn reads it once,
 * for code outside React.
 */
const tuningViewOn = (
  superDraw: boolean,
  flag: boolean,
  popTuningView: boolean,
  mapType: MapType | undefined,
  mapMode: MapMode
) =>
  superDraw &&
  flag &&
  popTuningView &&
  mapType !== MAP_TYPES.COMMUNITY &&
  mapMode !== MAP_MODES.COI;

export const useTuningView = () => {
  const superDraw = useToolbarStore(state => state.superDraw);
  const flag = useFeatureFlag('tuningView');
  const popTuningView = useChartStore(state => state.chartOptions.popTuningView);
  const mapType = useMapStore(state => state.mapDocument?.map_type);
  const mapMode = useMapControlsStore(state => state.mapMode);
  return tuningViewOn(superDraw, flag, popTuningView, mapType, mapMode);
};

export const isTuningViewOn = () =>
  tuningViewOn(
    useToolbarStore.getState().superDraw,
    resolveFlag(
      'tuningView',
      useFeatureFlagStore.getState().overrides.tuningView,
      getSiteSettings()?.feature_flags
    ),
    useChartStore.getState().chartOptions.popTuningView,
    useMapStore.getState().mapDocument?.map_type,
    useMapControlsStore.getState().mapMode
  );
