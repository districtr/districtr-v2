import {NullableZone} from '@/app/constants/types';
import {AllTabularColumns} from '../summaryStats';
import {DocumentObject} from './types';
import {ColumnarTableData} from '../../ParquetWorker/parquetWorker.types';
import {get} from '../factory';
import { useMapStore } from '@/app/store/mapStore';
import { EMPTY_FT_COLLECTION } from '@/app/constants/map/layerStyle';

type PublicDistrictData = {
  zone: number;
  demographic_data: Record<string, unknown> | null;
  geometry: string | GeoJSON.Geometry;
};

export const getPublicDistricts = async (mapDocument?: DocumentObject | null) => {
  if (!mapDocument) {
    return null;
  }
  const response = await get<Array<PublicDistrictData>>(`document/${mapDocument?.public_id}/stats`)(
    {}
  );
  if (!response.ok) {
    useMapStore.getState().setErrorNotification({
      message: response.error.detail || 'Failed to fetch public district stats',
      severity: 2,
    });
    return null;
  }

  const geojsonFeatures: GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>[] = [];
  const columns: Set<AllTabularColumns[number]> = new Set();
  const demographicData: ColumnarTableData = {
    path: [],
    sourceLayer: [],
  };
  const assignments: Map<string, NullableZone> = new Map();
  let statefp = '';
  response.response.forEach((row: PublicDistrictData) => {
    const demographicDataRow =
      row.demographic_data && typeof row.demographic_data === 'object' ? row.demographic_data : {};
    if (typeof demographicDataRow.statefp === 'string') {
      statefp = demographicDataRow.statefp;
    }
    const path = String(row.zone);
    const geometry =
      typeof row.geometry === 'string'
        ? (JSON.parse(row.geometry) as GeoJSON.Geometry)
        : row.geometry;
    const feature = {
      type: 'Feature',
      geometry,
      properties: {
        ...demographicDataRow,
        zone: row.zone,
        path,
      },
    } as GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>;
    geojsonFeatures.push(feature);
    demographicData.path.push(path);
    demographicData.sourceLayer.push(mapDocument?.parent_layer ?? '');
    Object.entries(demographicDataRow).forEach(([column, value]) => {
      const numericValue =
        typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
      if (Number.isNaN(numericValue)) return;
      const typedColumn = column as AllTabularColumns[number];
      columns.add(typedColumn);
      if (!(typedColumn in demographicData)) demographicData[typedColumn] = [];
      demographicData[typedColumn]!.push(numericValue);
    });
    assignments.set(path, row.zone);
  });

  return {
    geojsonFeatures,
    columns,
    demographicData,
    assignments,
    statefp,
  };
};
