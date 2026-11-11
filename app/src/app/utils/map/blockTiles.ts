import {create} from 'zustand';
import type {ErrorEvent, Map as MapLibreMap, VectorTileSource} from 'maplibre-gl';
import {BLOCK_SOURCE_ID} from '@constants/map/layerIds';
import {splitsTiles} from '@constants/map/sources';

/**
 * A map with a child layer starts on its parent-only archive (constants/map/sources.ts).
 * This module moves a document's block source to the combined archive ahead of the first
 * shatter, and tells the shatter when the tiles in view come from it.
 */

/** The document whose source has moved to the combined archive. It stays there, so
 * undoing the last shatter leaves the source as it is. */
export const useBlockTilesStore = create<{combinedFor?: string}>(() => ({}));

let ready: Promise<void> = Promise.resolve();
let markReady: (() => void) | undefined;

/** Moves the document's block source to the combined archive. Callers ask when blocks
 * are about to be needed: the Break tool is selected, a shatter starts, or the plan has
 * shattered parents. */
export const requestBlockTiles = (
  mapDocument: {document_id: string; child_layer?: string | null} | null | undefined
) => {
  if (!mapDocument || !splitsTiles(mapDocument)) return;
  if (useBlockTilesStore.getState().combinedFor === mapDocument.document_id) return;
  ready = new Promise(resolve => {
    markReady = resolve;
  });
  useBlockTilesStore.setState({combinedFor: mapDocument.document_id});
};

/** Resolves once the tiles in view come from the archive last asked for. */
export const blockTilesReady = () => ready;

/** For a source that mounted on the archive asked for: its tiles all come from it. */
export const markBlockTilesReady = () => {
  markReady?.();
  markReady = undefined;
};

// Delay before each retry of a failed TileJSON; the last one repeats.
const TILEJSON_RETRY_MS = [1000, 3000, 9000, 15000];

/**
 * Follows the block source after its url changed to `url`, until every tile in view comes
 * from that archive. Returns a function that stops following.
 * - A failed TileJSON request is sent again, since MapLibre leaves the source on the
 *   previous archive's tiles after one failure.
 * - A tile that was loading when the TileJSON arrived keeps the previous archive's data:
 *   MapLibre re-parses it where it should fetch it again. Once the source has settled,
 *   one refresh fetches the tiles in view from the current url.
 */
export const followBlockTiles = (map: MapLibreMap, url: string) => {
  const done = markReady;
  markReady = undefined;
  const tilesPath = `${new URL(url).pathname}/`;
  const source = () => map.getSource(BLOCK_SOURCE_ID) as VectorTileSource | undefined;
  let stage: 'tilejson' | 'settling' | 'refreshed' = 'tilejson';
  let retries = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    map.off('sourcedata', advance);
    map.off('idle', advance);
    map.off('error', retryTileJson);
    clearTimeout(retryTimer);
  };

  function advance() {
    const current = source();
    if (stage === 'tilejson') {
      const loaded =
        current?.url === url &&
        current.tiles?.some(tile => new URL(tile).pathname.startsWith(tilesPath));
      if (!loaded) return;
      stage = 'settling';
    }
    if (!current || !map.isSourceLoaded(BLOCK_SOURCE_ID)) return;
    if (stage === 'settling') {
      stage = 'refreshed';
      map.refreshTiles(BLOCK_SOURCE_ID);
      return;
    }
    stop();
    done?.();
  }

  function retryTileJson(e: ErrorEvent & {sourceId?: string; tile?: unknown}) {
    // A tile's own failure carries the tile; the TileJSON's carries the source alone.
    if (stage !== 'tilejson' || e.sourceId !== BLOCK_SOURCE_ID || e.tile) return;
    const delay = TILEJSON_RETRY_MS[Math.min(retries++, TILEJSON_RETRY_MS.length - 1)];
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      if (source()?.url === url) source()?.setUrl(url);
    }, delay);
  }

  map.on('sourcedata', advance);
  map.on('idle', advance);
  map.on('error', retryTileJson);
  advance();
  return stop;
};
