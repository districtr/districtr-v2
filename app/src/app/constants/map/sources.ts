import {TILESET_URL, TILES_SPLIT, TILES_WORKER_URL} from '@utils/api/constants';

/** Key of the parent-only archive that pairs with a combined district tileset. The
 * pipeline writes one beside the combined archive of every map with a child layer. */
export const parentTilesPath = (tilesPath: string) =>
  tilesPath.replace(/\.pmtiles$/, '.parent.pmtiles');

/** Whether a map's source starts on its parent-only archive. */
export const splitsTiles = (mapDocument: {child_layer?: string | null}) =>
  !!TILES_WORKER_URL && TILES_SPLIT && !!mapDocument.child_layer;

/** Source URL for a district tileset, or for its parent-only archive. */
export const blocksTilesUrl = (tilesPath: string, parentOnly = false) => {
  const path = parentOnly ? parentTilesPath(tilesPath) : tilesPath;
  return TILES_WORKER_URL ? `${TILES_WORKER_URL}/${path}` : `pmtiles://${TILESET_URL}/${path}`;
};

/** Whether `url` is a source URL that blocksTilesUrl builds for `tilesPath`. */
export const isBlocksTilesUrl = (url: string | undefined, tilesPath: string) =>
  !!url && (url.includes(tilesPath) || url.includes(parentTilesPath(tilesPath)));
