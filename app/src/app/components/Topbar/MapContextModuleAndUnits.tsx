import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {sanitizeCommunityModuleName} from '@/app/utils/communities';
import {MAP_MODES} from '@constants/map/mode';

/**
 * The map module name and a one-line units sentence for the topbar title's
 * tooltip: the module shows inline until the map is named, then moves into
 * the hover along with the unit info.
 */
export const useMapModuleInfo = () => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const parentGeoUnitType = mapDocument?.parent_geo_unit_type;
  const childGeoUnitType = mapDocument?.child_geo_unit_type;
  const dataSourceName = mapDocument?.data_source_name;
  const moduleName =
    (mapMode === MAP_MODES.COI
      ? sanitizeCommunityModuleName(mapDocument?.map_module)
      : mapDocument?.map_module) ?? '';

  const unitsSentence = parentGeoUnitType
    ? `You are drawing ${parentGeoUnitType}s${
        childGeoUnitType ? `, which can be broken into ${childGeoUnitType}s` : ''
      }.`
    : null;
  const dataSourceSentence = dataSourceName ? `Using data from ${dataSourceName}.` : null;

  return {moduleName, unitsSentence, dataSourceSentence};
};
