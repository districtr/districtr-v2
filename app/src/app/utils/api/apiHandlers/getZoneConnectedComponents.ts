import {DocumentObject} from './types';
import {get} from '../factory';

export type ZoneConnectedComponent = {
  geo_ids: string[];
  /** Other zone -> graph edges from this component to units in that zone. */
  neighbor_zones: Record<string, number>;
};

/** Each connected component of a zone, largest (by unit count) first. */
export const getZoneConnectedComponents = (mapDocument: DocumentObject, zone: number) =>
  get<{components: ZoneConnectedComponent[]}>(
    `document/${mapDocument.public_id}/contiguity/${zone}/components`
  )({});
