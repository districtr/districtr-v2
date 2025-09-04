import {useMapStore} from '@/app/store/mapStore';
import {Flex, Text, Tooltip} from '@radix-ui/themes';

export const MapContextModuleAndUnits = () => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const parentGeoUnitType = mapDocument?.parent_geo_unit_type;
  const childGeoUnitType = mapDocument?.child_geo_unit_type;
  const dataSourceName = mapDocument?.data_source_name;

  const mapModuleDisplay = (
    <Text size="2" className="text-gray-500">
      {mapDocument?.map_module || ''}
    </Text>
  );
  if (!parentGeoUnitType && !childGeoUnitType) {
    return mapModuleDisplay;
  }
  return (
    <Tooltip
      content={
        <Text>
          {!!dataSourceName && (
            <>
              {' '}
              Using data from <b>{dataSourceName}</b>.{' '}
            </>
          )}
          Building on <b>{parentGeoUnitType}</b>
          {!!childGeoUnitType && (
            <>
              , which can be broken down into <b>{childGeoUnitType}</b>
            </>
          )}
          .
        </Text>
      }
    >
      {mapModuleDisplay}
    </Tooltip>
  );
};
