import {MercatorCoordinate, type MapGeoJSONFeature} from 'maplibre-gl';
import type {MultiPolygon, Position} from 'geojson';
import {BLOCK_SOURCE_ID} from '@constants/map/layerIds';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {filterFeatures} from '@utils/map/filterFeatures';
import {getFeaturesInBbox} from '@utils/map/getFeaturesInBbox';
import type {PaintEventHandler} from '@utils/map/types';
import {arcOf, side, unitOf} from './access';
import {toLngLat} from './boundaries';
import {getIndexes, type ChunkIndex, type TopologyIndexes} from './indexes';
import {getTopology, subscribeTopology} from './state';
import type {ArcChunk, Topology, UnitChunk} from './types';

/** Squared distance from point p to segment ab. */
const pointSegDist2 = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + t * dx - px;
  const ey = ay + t * dy - py;
  return ex * ex + ey * ey;
};

const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
  Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));

/** Squared distance between segments pq and ab (0 when they properly cross). */
const segSegDist2 = (
  px: number,
  py: number,
  qx: number,
  qy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
) => {
  if (
    orient(px, py, qx, qy, ax, ay) * orient(px, py, qx, qy, bx, by) < 0 &&
    orient(ax, ay, bx, by, px, py) * orient(ax, ay, bx, by, qx, qy) < 0
  ) {
    return 0;
  }
  return Math.min(
    pointSegDist2(px, py, ax, ay, bx, by),
    pointSegDist2(qx, qy, ax, ay, bx, by),
    pointSegDist2(ax, ay, px, py, qx, qy),
    pointSegDist2(bx, by, px, py, qx, qy)
  );
};

/** Whether arc `k` of `chunk` comes within r of segment pq (a point when p = q). */
const arcNear = (
  chunk: ArcChunk,
  k: number,
  px: number,
  py: number,
  qx: number,
  qy: number,
  r: number
) => {
  const {coords, offsets} = chunk;
  const r2 = r * r;
  const isPoint = px === qx && py === qy;
  const minx = Math.min(px, qx) - r;
  const maxx = Math.max(px, qx) + r;
  const miny = Math.min(py, qy) - r;
  const maxy = Math.max(py, qy) + r;
  for (let v = offsets[k], end = offsets[k + 1] - 1; v < end; v++) {
    const ax = coords[2 * v];
    const ay = coords[2 * v + 1];
    const bx = coords[2 * v + 2];
    const by = coords[2 * v + 3];
    if (
      (ax < minx && bx < minx) ||
      (ax > maxx && bx > maxx) ||
      (ay < miny && by < miny) ||
      (ay > maxy && by > maxy)
    ) {
      continue;
    }
    const d2 = isPoint
      ? pointSegDist2(px, py, ax, ay, bx, by)
      : segSegDist2(px, py, qx, qy, ax, ay, bx, by);
    if (d2 <= r2) return true;
  }
  return false;
};

/** Even-odd point-in-polygon over a unit's rings (outer and holes; direction is irrelevant). */
export const unitContains = (
  topo: Topology,
  idx: TopologyIndexes,
  chunk: UnitChunk,
  k: number,
  x: number,
  y: number
) => {
  const hint = idx.shatterOf.get(chunk);
  let inside = false;
  for (let r = chunk.ringStart[k]; r < chunk.ringStart[k + 1]; r++) {
    for (let i = chunk.refStart[r]; i < chunk.refStart[r + 1]; i++) {
      const ref = chunk.refs[i];
      const arc = arcOf(topo, ref < 0 ? ~ref : ref, hint);
      if (!arc) continue;
      const {coords, offsets, bbox} = arc.chunk;
      const l = arc.local;
      if (bbox[4 * l + 1] > y || bbox[4 * l + 3] <= y || bbox[4 * l + 2] < x) continue;
      for (let v = offsets[l], end = offsets[l + 1] - 1; v < end; v++) {
        const ax = coords[2 * v];
        const ay = coords[2 * v + 1];
        const bx = coords[2 * v + 2];
        const by = coords[2 * v + 3];
        if (ay > y !== by > y && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) inside = !inside;
      }
    }
  }
  return inside;
};

const addArcHits = (
  topo: Topology,
  arcs: ChunkIndex<ArcChunk> | null,
  hits: Set<number>,
  px: number,
  py: number,
  qx: number,
  qy: number,
  r: number
) => {
  if (!arcs) return;
  const {index, chunkOf, localOf} = arcs;
  const found = index.search(
    Math.min(px, qx) - r,
    Math.min(py, qy) - r,
    Math.max(px, qx) + r,
    Math.max(py, qy) + r
  );
  for (const i of found) {
    const chunk = chunkOf[i];
    const k = localOf[i];
    const a = side(topo, chunk, k, 'a');
    const b = side(topo, chunk, k, 'b');
    if ((a < 0 || hits.has(a)) && (b < 0 || hits.has(b))) continue;
    if (!arcNear(chunk, k, px, py, qx, qy, r)) continue;
    if (a >= 0) hits.add(a);
    if (b >= 0) hits.add(b);
  }
};

/**
 * Global ids of active units within Mercator distance r of segment pq (a disk when p = q,
 * a capsule otherwise). A unit qualifies iff one of its boundary segments is within r of pq,
 * or it contains q: with no boundary within r, the brush lies wholly inside or outside it.
 */
export const selectUnits = (
  topo: Topology,
  px: number,
  py: number,
  qx: number,
  qy: number,
  r: number
): Set<number> => {
  const idx = getIndexes(topo);
  const hits = new Set<number>();
  addArcHits(topo, idx.exterior, hits, px, py, qx, qy, r);
  addArcHits(topo, idx.interior, hits, px, py, qx, qy, r);
  const {index, chunkOf, localOf} = idx.units;
  for (const i of index.search(qx, qy, qx, qy)) {
    const chunk = chunkOf[i];
    const k = localOf[i];
    if (hits.has(chunk.firstUnit + k)) continue;
    if (unitContains(topo, idx, chunk, k, qx, qy)) {
      hits.add(chunk.firstUnit + k);
      break;
    }
  }
  return hits;
};

/** A unit's rings as a lon/lat MultiPolygon, for the paint-constraint (overlay) filter. */
export const unitGeometry = (topo: Topology, chunk: UnitChunk, k: number): MultiPolygon => {
  const polygons: Position[][][] = [];
  for (let r = chunk.ringStart[k]; r < chunk.ringStart[k + 1]; r++) {
    const ring: Position[] = [];
    let area = 0;
    for (let i = chunk.refStart[r]; i < chunk.refStart[r + 1]; i++) {
      const ref = chunk.refs[i];
      const arc = arcOf(topo, ref < 0 ? ~ref : ref);
      if (!arc) continue;
      const {coords, offsets} = arc.chunk;
      const start = offsets[arc.local];
      const end = offsets[arc.local + 1];
      // Each arc starts where the previous one ended; skip that shared vertex.
      for (let j = ring.length ? 1 : 0; j < end - start; j++) {
        const v = ref < 0 ? end - 1 - j : start + j;
        const last = ring[ring.length - 1];
        const next = toLngLat(coords[2 * v], coords[2 * v + 1]);
        if (last) area += last[0] * next[1] - next[0] * last[1];
        ring.push(next);
      }
    }
    // Rings come polygon by polygon: a CCW (lon/lat) ring starts one, CW rings are its holes.
    if (area > 0 || !polygons.length) polygons.push([ring]);
    else polygons[polygons.length - 1].push(ring);
  }
  return {type: 'MultiPolygon', coordinates: polygons};
};

/** Pseudo-feature in the shape mutateZoneAssignments, hover and filterFeatures read. */
export const unitFeature = (
  topo: Topology,
  unit: number,
  parentLayer: string,
  childLayer: string
): MapGeoJSONFeature | undefined => {
  const u = unitOf(topo, unit);
  if (!u) return;
  const path = u.chunk.paths[u.local];
  const sourceLayer = unit < topo.P ? parentLayer : childLayer;
  let geometry: MultiPolygon | undefined;
  return {
    id: path,
    source: BLOCK_SOURCE_ID,
    sourceLayer,
    properties: {path, total_pop_20: u.chunk.totalPop[u.local], __sourceLayer: sourceLayer},
    // Built only if read: filterFeatures needs it for an uncached paint constraint.
    get geometry() {
      return (geometry ??= unitGeometry(topo, u.chunk, u.local));
    },
  } as unknown as MapGeoJSONFeature;
};

// Build indexes when the topology lands or reshatters, not on the next brush event.
subscribeTopology(getIndexes);

/** Previous brush center (Mercator) within the current paint gesture. */
let prev: {x: number; y: number} | null = null;
/** Clears `prev` at gesture start/end; subscribed on first use (the stores import this file). */
let unsubscribePainting: (() => void) | null = null;

/**
 * PaintEventHandler over the in-memory topology: a disk of radius `brushSize` px at the
 * cursor, or while painting the capsule from the previous brush position, so fast drags
 * leave no gaps. Selects every active unit, rendered or not.
 * Falls back to getFeaturesInBbox until the topology loads, and for non-area tools.
 */
export const getFeaturesInBrushTopology: PaintEventHandler = (
  map,
  e,
  brushSize,
  layers,
  filterLocked = true
) => {
  unsubscribePainting ??= useMapControlsStore.subscribe(
    state => state.isPainting,
    () => (prev = null)
  );
  const topo = getTopology();
  const {activeTool, isPainting} = useMapControlsStore.getState();
  const {mapDocument} = useMapStore.getState();
  const areaTool =
    activeTool === ACTIVE_TOOLS.BRUSH ||
    activeTool === ACTIVE_TOOLS.ERASER ||
    activeTool === ACTIVE_TOOLS.INSPECTOR;
  if (!topo || !map || !areaTool || !mapDocument?.parent_layer) {
    prev = null;
    return getFeaturesInBbox(map, e, brushSize, layers, filterLocked);
  }
  // ponytail: assumes north-up, no pitch (px -> Mercator is a uniform scale); a rotated
  // or pitched map needs the brush projected through map.unproject instead.
  const r = brushSize / map.transform.worldSize;
  const q = MercatorCoordinate.fromLngLat(e.lngLat);
  const p = isPainting && prev ? prev : q;
  prev = isPainting ? {x: q.x, y: q.y} : null;
  const features: MapGeoJSONFeature[] = [];
  const childLayer = mapDocument.child_layer ?? mapDocument.parent_layer;
  selectUnits(topo, p.x, p.y, q.x, q.y, r).forEach(unit => {
    const f = unitFeature(topo, unit, mapDocument.parent_layer, childLayer);
    f && features.push(f);
  });
  return filterFeatures({_features: features, filterLocked});
};
