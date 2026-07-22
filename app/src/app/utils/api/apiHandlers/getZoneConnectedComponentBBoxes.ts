import {DocumentObject} from './types';
import {getMsgpack} from '../msgpack';

export const getZoneConnectedComponentBBoxes = async (
  mapDocument: DocumentObject,
  zone: number
) => {
  if (!mapDocument) {
    return {
      ok: false,
      error: {
        detail: 'No document provided',
      },
    } as const;
  }

  // Features carry {bbox, n_geos} properties (plus geo_ids for single-geometry
  // components), sorted largest component first; raw bbox Polygons may still
  // appear in payloads from older backends.
  return await getMsgpack<{
    features: Array<GeoJSON.Feature<GeoJSON.Polygon> | GeoJSON.Polygon>;
  }>(`document/${mapDocument.public_id}/contiguity/${zone}/connected_component_bboxes`);
};
