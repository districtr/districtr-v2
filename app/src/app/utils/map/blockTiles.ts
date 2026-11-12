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
 * - When the TileJSON arrives, MapLibre fetches every loaded tile again from the current
 *   url. A tile that was still loading at that moment is re-parsed where it should be
 *   fetched, so it keeps the previous archive's data. Only then, once the source has
 *   settled, one refresh fetches the tiles in view again.
 */
export const followBlockTiles = (map: MapLibreMap, url: string) => {
  const done = markReady;
  markReady = undefined;
  const tilesPath = `${new URL(url).pathname}/`;
  const source = () => map.getSource(BLOCK_SOURCE_ID) as VectorTileSource | undefined;
  let stage: 'tilejson' | 'settling' | 'refreshed' = 'tilejson';
  // Whether a tile in view may hold the previous archive's data.
  let stale = true;
  let retries = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    map.off('sourcedata', advance);
    map.off('idle', onIdle);
    map.off('error', retryTileJson);
    clearTimeout(retryTimer);
  };

  function advance(e?: {sourceId?: string; sourceDataType?: string}) {
    const current = source();
    if (stage === 'tilejson') {
      const loaded =
        current?.url === url &&
        current.tiles?.some(tile => new URL(tile).pathname.startsWith(tilesPath));
      if (!loaded) return;
      stage = 'settling';
      // This is the TileJSON's own event when it is the source's metadata event, and
      // MapLibre's reload follows it. With every tile loaded now, that reload is enough.
      const atArrival = e?.sourceId === BLOCK_SOURCE_ID && e.sourceDataType === 'metadata';
      stale = !(atArrival && map.isSourceLoaded(BLOCK_SOURCE_ID));
      return;
    }
    if (!current || !map.isSourceLoaded(BLOCK_SOURCE_ID)) return;
    if (stage === 'settling' && stale) {
      stage = 'refreshed';
      map.refreshTiles(BLOCK_SOURCE_ID);
      return;
    }
    stop();
    done?.();
  }

  function onIdle() {
    advance();
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
  map.on('idle', onIdle);
  map.on('error', retryTileJson);
  advance();
  return stop;
};
