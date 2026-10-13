import {NullableZone} from '@constants/map/zone';
import {AllTabularColumns} from '../summaryStats';
import {DocumentObject} from './types';
import {ColumnarTableData} from '../../ParquetWorker/parquetWorker.types';
import {get} from '../factory';
import {PUBLIC_SOURCE_ID} from '@constants/map/layerIds';

/**
 * Shared React Query key for the public districts query. `updated_at` busts the
 * cache when the plan changes; every consumer (PublicSource, useZoomToDistrict)
 * must build the key through this helper so the keys can't drift apart.
 */
export const publicDistrictsQueryKey = (mapDocument?: DocumentObject | null) =>
  [PUBLIC_SOURCE_ID, mapDocument?.public_id, mapDocument?.updated_at] as const;

type StatsFeatureProperties = {
  zone: NullableZone;
  demographic_data: Record<string, unknown> | null;
  updated_at?: string;
};

type StatsFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Geometry | null,
  StatsFeatureProperties
>;

export const getPublicDistricts = async (mapDocument?: DocumentObject | null) => {
  if (!mapDocument) {
    throw new Error('No map document provided');
  }
  // /stats returns a GeoJSON FeatureCollection (or 307 redirects to the same
  // shape on the S3 / Cloudfront CDN). Each feature is a zone; the unassigned bucket is a
  // feature with `geometry: null`.
  const response = await get<StatsFeatureCollection>(`document/${mapDocument?.public_id}/stats`)(
    {}
  );
  if (!response.ok) {
    throw new Error(response.error.detail || 'Failed to fetch public district stats');
  }

  const geojsonFeatures: GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>[] = [];
  const columns: Set<AllTabularColumns[number]> = new Set();
  const demographicData: ColumnarTableData = {
    path: [],
    sourceLayer: [],
  };
  let statefp = '';
  const features = response.response?.features ?? [];
  features.forEach(feature => {
    const props = feature.properties ?? ({} as StatsFeatureProperties);
    const zone = props.zone ?? null;
    const demographicDataRow =
      props.demographic_data && typeof props.demographic_data === 'object'
        ? props.demographic_data
        : {};
    if (typeof demographicDataRow.statefp === 'string') {
      statefp = demographicDataRow.statefp;
    }
    const path = zone !== null ? String(zone) : '__unassigned__';

    if (zone !== null && feature.geometry) {
      geojsonFeatures.push({
        type: 'Feature',
        geometry: feature.geometry as GeoJSON.Geometry,
        properties: {
          ...demographicDataRow,
          zone,
          path,
        },
      });
    }

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
  });

  return {
    geojsonFeatures,
    columns,
    demographicData,
    statefp,
  };
};
