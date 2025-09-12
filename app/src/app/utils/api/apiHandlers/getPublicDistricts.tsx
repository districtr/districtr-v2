import {NullableZone} from '@/app/constants/types';
import {AllTabularColumns} from '../summaryStats';
import {DocumentObject} from './types';
import {ColumnarTableData} from '../../ParquetWorker/parquetWorker.types';
import {get} from '../factory';

type PublicDistrictData = {
  zone: number;
  demographic_data: Record<string, any>;
  geometry: string; //  GeoJSON.Geometry;
};

export const getPublicDistricts = async (mapDocument?: DocumentObject | null) => {
  if (!mapDocument) {
    return null;
  }
  const response = await get<Array<PublicDistrictData>>(`document/${mapDocument?.public_id}/stats`)(
    {}
  );
  if (response.ok) {
    const geojsonFeatures: GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>[] = [];
    const columns: Set<AllTabularColumns[number]> = new Set();
    const demographicData: ColumnarTableData = {
      path: [],
      sourceLayer: [],
    };
    const assignments: Map<string, NullableZone> = new Map();
    let statefp = '';
    response.response.forEach((row: any, i) => {
      if (row.demographic_data.statefp) {
        statefp = row.demographic_data.statefp;
      }
      const feature = {
        type: 'Feature',
        geometry: JSON.parse(row.geometry) as GeoJSON.Geometry,
        properties: {
          ...row.demographic_data,
          zone: row.zone,
          path: row.zone,
        },
      } as GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>;
      geojsonFeatures.push(feature);
      Object.keys(row.demographic_data).forEach(column =>
        columns.add(column as AllTabularColumns[number])
      );
      demographicData.path.push(row.zone);
      demographicData.sourceLayer.push(mapDocument?.parent_layer ?? '');
      Object.entries(row.demographic_data).forEach(([column, value]) => {
        if (!columns.has(column as AllTabularColumns[number]))
          columns.add(column as AllTabularColumns[number]);
        if (!(column in demographicData)) demographicData[column as AllTabularColumns[number]] = [];
        demographicData[column as AllTabularColumns[number]]!.push(value as number);
        assignments.set(row.zone, row.zone);
      });
    });

    return {
      geojsonFeatures,
      columns,
      demographicData,
      assignments,
      statefp,
    };
  }
};
