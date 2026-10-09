import type {Feature, LineString, Position} from 'geojson';
import type {GeoJSONSourceDiff} from 'maplibre-gl';
import {arcOf} from './access';
import {latOfMercY, lonOfMercX} from './decode';
import type {Topology} from './types';

/** Mercator (0..1) to lon/lat, the inverse of MercatorCoordinate.fromLngLat. */
export const toLngLat = (x: number, y: number): [number, number] => [lonOfMercX(x), latOfMercY(y)];

/** Zone per global unit id (0 = unassigned), from the store's path -> zone map. */
export const unitAssignment = (
  topo: Topology,
  zoneAssignments: Map<string, number | null>
): Int16Array => {
  const assignment = new Int16Array(topo.P + topo.B);
  zoneAssignments.forEach((zone, path) => {
    if (!zone) return;
    const unit = topo.unitByPath.get(path);
    if (unit !== undefined) assignment[unit] = zone;
  });
  return assignment;
};

/**
 * Ids of active arcs (all exterior arcs, plus interior arcs of shattered parents) whose two
 * active sides are in different zones, at least one of them assigned. Outside the map is its
 * own value, so the plan's outer edge shows wherever it is painted.
 */
export const boundaryArcs = (topo: Topology, assignment: Int16Array): Set<number> => {
  const {P, exterior: ext} = topo;
  const shattered = new Uint8Array(P);
  topo.shattered.forEach(p => (shattered[p] = 1));
  const zoneAt = (parent: number, child: number) =>
    parent < 0 ? -1 : shattered[parent] ? assignment[P + child] : assignment[parent];
  const arcs = new Set<number>();
  for (let k = 0; k < topo.E; k++) {
    const a = zoneAt(ext.aParent[k], ext.aChild[k]);
    const b = zoneAt(ext.bParent[k], ext.bChild[k]);
    if (a !== b && (a > 0 || b > 0)) arcs.add(k);
  }
  topo.shattered.forEach(p => {
    const interior = topo.chunks.get(p)?.interior;
    if (!interior) return;
    for (let k = 0; k < interior.lengthM.length; k++) {
      const a = assignment[P + interior.aChild[k]];
      const b = assignment[P + interior.bChild[k]];
      if (a !== b) arcs.add(interior.firstArc + k);
    }
  });
  return arcs;
};

export const arcFeature = (topo: Topology, arc: number): Feature<LineString> | undefined => {
  const found = arcOf(topo, arc);
  if (!found) return;
  const {coords, offsets} = found.chunk;
  const coordinates: Position[] = [];
  for (let v = offsets[found.local]; v < offsets[found.local + 1]; v++) {
    coordinates.push(toLngLat(coords[2 * v], coords[2 * v + 1]));
  }
  return {type: 'Feature', id: arc, properties: {}, geometry: {type: 'LineString', coordinates}};
};

/** GeoJSONSource.updateData diff taking the source from `shown` to `next` boundary arcs. */
export const boundaryDiff = (
  topo: Topology,
  shown: Set<number>,
  next: Set<number>
): GeoJSONSourceDiff => {
  const remove: number[] = [];
  const add: Feature[] = [];
  shown.forEach(arc => next.has(arc) || remove.push(arc));
  next.forEach(arc => {
    if (shown.has(arc)) return;
    const f = arcFeature(topo, arc);
    f && add.push(f);
  });
  return {remove, add};
};
