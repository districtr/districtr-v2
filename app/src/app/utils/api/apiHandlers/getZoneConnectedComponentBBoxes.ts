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

  // Multi-geometry components are raw bbox Polygons; single-geometry components
  // are Features carrying {bbox, geo_ids} properties.
  return await getMsgpack<{
    features: Array<GeoJSON.Feature<GeoJSON.Polygon> | GeoJSON.Polygon>;
  }>(`document/${mapDocument.public_id}/contiguity/${zone}/connected_component_bboxes`);
};
