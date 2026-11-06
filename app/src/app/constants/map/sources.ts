import {TILESET_URL, TILES_WORKER_URL} from '@utils/api/constants';

/** Source URL for a district tileset. Both forms contain `tilesPath`, which
 * handleDataLoad matches against the map document's tiles_s3_path. */
export const blocksTilesUrl = (tilesPath: string) =>
  TILES_WORKER_URL ? `${TILES_WORKER_URL}/${tilesPath}` : `pmtiles://${TILESET_URL}/${tilesPath}`;
