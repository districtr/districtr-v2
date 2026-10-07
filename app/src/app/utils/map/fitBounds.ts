import type {LngLatBoundsLike, Map as MapLibreMap, PaddingOptions} from 'maplibre-gl';
import {BLOCK_SOURCE_ID} from '@/app/constants/map/layerIds';
import type {DocumentObject} from '@/app/utils/api/apiHandlers/types';

/**
 * Clamp fitBounds padding to a fraction of each canvas dimension (default a
 * quarter, leaving half the canvas for the fitted bounds). Unclamped, a fixed
 * padding can eat most of a small canvas, forcing extreme zoom-outs or a no-op.
 */
export const getFitBoundsPadding = (
  map: MapLibreMap | null | undefined,
  desiredPadding: number,
  maxFraction = 0.25
): PaddingOptions | number => {
  const canvas = map?.getCanvas();
  if (!canvas) return desiredPadding;
  const horizontal = Math.max(
    0,
    Math.min(desiredPadding, Math.floor(canvas.clientWidth * maxFraction))
  );
  const vertical = Math.max(
    0,
    Math.min(desiredPadding, Math.floor(canvas.clientHeight * maxFraction))
  );
  return {top: vertical, bottom: vertical, left: horizontal, right: horizontal};
};

/**
 * Union bbox of the geometries' rendered tile pieces, or null if none are in
 * the loaded tiles (a feature can be split across tiles).
 */
export const queryRenderedGeoIdBounds = (
  map: MapLibreMap | null | undefined,
  mapDocument: DocumentObject | null | undefined,
  geoIds: string[]
): LngLatBoundsLike | null => {
  if (!map) return null;
  const sourceLayers = [mapDocument?.parent_layer, mapDocument?.child_layer].filter(
    (l): l is string => !!l
  );
  const pieces = sourceLayers.flatMap(sourceLayer =>
    map.querySourceFeatures(BLOCK_SOURCE_ID, {
      sourceLayer,
      filter: ['in', ['get', 'path'], ['literal', geoIds]],
    })
  );
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const eat = (coords: any) => {
    if (typeof coords[0] === 'number') {
      if (coords[0] < minX) minX = coords[0];
      if (coords[0] > maxX) maxX = coords[0];
      if (coords[1] < minY) minY = coords[1];
      if (coords[1] > maxY) maxY = coords[1];
    } else {
      coords.forEach(eat);
    }
  };
  pieces.forEach(p => 'coordinates' in p.geometry && eat(p.geometry.coordinates));
  if (minX > maxX) return null;
  return [
    [minX, minY],
    [maxX, maxY],
  ];
};

/** Minimum hold at the general-area snap before the fly-in, so the orienting
 * pause is perceptible even when tiles are cached and 'idle' fires at once. */
const MIN_DWELL_MS = 400;

// Generous padding so the target lands with surrounding context to orient
// by, and linear to avoid flyTo's zoom-out-then-in swoop. A single unit
// gets much heavier padding (up to 40% of the canvas per side) — its
// bounds are tiny, and framing it tight would land at street level with
// nothing around it to orient by. Duration scales with how far this fly-in
// actually zooms, so a big jump doesn't rush by at the same speed as a
// small one — a common motion-sickness trigger.
const finalFitOptions = (map: MapLibreMap, bounds: LngLatBoundsLike, singleUnit: boolean) => {
  const padding = singleUnit ? getFitBoundsPadding(map, 1000, 0.4) : getFitBoundsPadding(map, 250);
  const targetZoom = map.cameraForBounds(bounds, {padding})?.zoom;
  const zoomDelta = targetZoom !== undefined ? Math.abs(targetZoom - map.getZoom()) : 0;
  return {
    duration: Math.min(Math.max(700, zoomDelta * 350), 1800),
    linear: true,
    padding,
  };
};

/**
 * Snaps (no animation) to the general area around `bounds`, then, once the map
 * is idle and a short dwell has passed, flies in. With `geoIds`, the fly targets
 * the union bbox of their rendered pieces: `bounds` may be centroid-derived, so
 * it understates the true extent and collapses to a point for a single unit.
 * Returns a cancel function; call it before starting another zoom (or on
 * unmount) so a stale idle handler can't yank the camera later.
 */
export const zoomToBounds = (
  map: MapLibreMap,
  mapDocument: DocumentObject | null | undefined,
  {bounds, geoIds, padding}: {bounds: LngLatBoundsLike; geoIds?: string[]; padding?: number}
): (() => void) => {
  const isSingleUnit = geoIds?.length === 1;
  // A single unit's `bounds` is centroid-derived — a zero-size point — so
  // cameraForBounds returns ~max zoom no matter the padding; padding can't
  // shrink a zoom computed from a zero-size box. Prefer the real rendered
  // geometry when it's already cached (tiles from a prior view); only fall back
  // to the point bbox, with much more headroom, when it's not, since the point
  // gives no real signal about the fly-in's target.
  const realBounds = geoIds?.length ? queryRenderedGeoIdBounds(map, mapDocument, geoIds) : null;
  const snapBounds = realBounds || bounds;
  const snapPadding = isSingleUnit
    ? getFitBoundsPadding(map, 1000, 0.4)
    : padding
      ? getFitBoundsPadding(map, padding)
      : undefined;
  const camera = map.cameraForBounds(snapBounds, {...(snapPadding ? {padding: snapPadding} : {})});
  if (camera) {
    // Snap stays headroom levels short of the fly-in's zoom; single units need
    // more since their padding is heavier, and more still when there's no real
    // geometry to base that estimate on.
    const headroom = isSingleUnit ? (realBounds ? 4 : 12) : 2;
    let snapZoom = Math.min((camera.zoom ?? 10) - headroom, 8);
    // But never wider than the map document's own extent.
    if (mapDocument?.extent) {
      const extentZoom = map.cameraForBounds(mapDocument.extent)?.zoom;
      if (extentZoom !== undefined) snapZoom = Math.max(snapZoom, extentZoom);
    }
    map.jumpTo({center: camera.center, zoom: Math.max(0, snapZoom)});
  }

  let idleDone = false;
  let dwellDone = false;
  let cancelled = false;
  const maybeFly = () => {
    if (cancelled || !idleDone || !dwellDone) return;
    cancelled = true;
    const finalBounds =
      (geoIds?.length && queryRenderedGeoIdBounds(map, mapDocument, geoIds)) || bounds;
    map.fitBounds(finalBounds, finalFitOptions(map, finalBounds, isSingleUnit));
  };
  const onIdle = () => {
    idleDone = true;
    maybeFly();
  };
  const dwellTimer = setTimeout(() => {
    dwellDone = true;
    maybeFly();
  }, MIN_DWELL_MS);
  map.once('idle', onIdle);
  return () => {
    cancelled = true;
    clearTimeout(dwellTimer);
    map.off('idle', onIdle);
  };
};
