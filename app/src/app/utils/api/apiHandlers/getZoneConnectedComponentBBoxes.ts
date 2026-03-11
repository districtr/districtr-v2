import {DocumentObject} from './types';
import {get} from '../factory';

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

  return await get<{
    features: Array<GeoJSON.Feature<GeoJSON.Polygon>>;
  }>(`document/${mapDocument.public_id}/contiguity/${zone}/connected_component_bboxes`)({});
};
