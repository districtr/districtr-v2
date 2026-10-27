import {
  MapLayerMouseEvent,
  MapLayerTouchEvent,
  MapGeoJSONFeature,
  Map as MaplibreMap,
} from 'maplibre-gl';
import {bbox, booleanPointInPolygon, coordAll} from '@turf/turf';
import type {MultiPolygon, Polygon, Position} from 'geojson';
import {BLOCK_SOURCE_ID, OVERLAY_LAYER_ID_PREFIXES} from '@/app/constants/map/layerIds';
import {overlayIdOf} from '@constants/map/paintBy';
import {MAP_MODES} from '@constants/map/mode';
import {filterFeatures} from '@utils/map/filterFeatures';
import {bboxesOverlap} from '@utils/map/isMostlyInside';
import {getPointSelectionData} from '@utils/api/apiHandlers/getPointSelectionData';
import {temporalManager} from '@utils/temporal';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {getOverlayName, queryAreaFeatures} from '@/app/store/overlayStore';

type BBox = [number, number, number, number];
type Piece = {polygon: Polygon | MultiPolygon; box: BBox};
export type AreaShape = {pieces: Piece[]; vertices: Position[]};
export type UnitClass = 'whole' | 'break' | 'skip';

const inBox = ([x, y]: Position, box: BBox) =>
  x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];
export const inArea = (point: Position, {pieces}: AreaShape) =>
  pieces.some(({polygon, box}) => inBox(point, box) && booleanPointInPolygon(point, polygon));

export const toAreaShape = (polygons: Array<Polygon | MultiPolygon>): AreaShape => ({
  pieces: polygons.map(polygon => ({polygon, box: bbox(polygon) as BBox})),
  vertices: polygons.flatMap(polygon => coordAll(polygon)),
});

/**
 * Where a unit stands against an area, from its bbox and center point only:
 * whole when its bbox lies inside (all corners in, and no stretch of the
 * area's outline inside the bbox); break when the outline may cross it (some
 * corner or its center in, or an outline vertex inside the bbox); skip
 * otherwise. Breaking too much is safe: the click heals units whose blocks
 * all end up in one zone.
 */
export const classifyUnit = (unit: {box: BBox; point: Position}, area: AreaShape): UnitClass => {
  if (!area.pieces.some(piece => bboxesOverlap(piece.box, unit.box))) return 'skip';
  const [w, s, e, n] = unit.box;
  const cornersIn = [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
  ].filter(corner => inArea(corner, area)).length;
  const outlineInBox = area.vertices.some(vertex => inBox(vertex, unit.box));
  if (cornersIn === 4 && !outlineInBox) return 'whole';
  if (cornersIn > 0 || outlineInBox || inArea(unit.point, area)) return 'break';
  return 'skip';
};

/**
 * Paint by overlay area's feature picker: the area under the cursor (one
 * point; the brush size doesn't apply), for the hover highlight and the click.
 * No unit work happens on hover; the click runs paintOverlayArea.
 */
export const getOverlayAreaUnderCursor = (
  map: MaplibreMap | null,
  e: MapLayerMouseEvent | MapLayerTouchEvent
): MapGeoJSONFeature[] | undefined => {
  const overlayId = overlayIdOf(useMapControlsStore.getState().mapOptions.paintBy);
  const clickLayerId = `${OVERLAY_LAYER_ID_PREFIXES.click}${overlayId}`;
  // The layer is gone while its overlay is hidden; querying it would throw.
  if (!map || !overlayId || !map.getLayer(clickLayerId)) return;
  return map.queryRenderedFeatures(e.point, {layers: [clickLayerId]}).slice(0, 1);
};

// Below this zoom the loaded tiles' outlines are too simplified to sort blocks
// near an area's edge. ponytail: a tuning knob, picked by eye on TIGER tiles.
export const MIN_AREA_PAINT_ZOOM = 8;

// One click at a time, start to finish: the shatter render drops the map lock
// mid-click, so the lock alone can't keep a second click (or an undo) from
// interleaving with this one's break, paint and heal.
let inFlight = false;
export const isAreaPaintInFlight = () => inFlight;

/**
 * Paint (or erase) one overlay area on click, exactly: units inside it paint
 * whole; units on its edge are broken, and only their blocks whose center lies
 * inside paint (the rest keep the unit's assignment: unassigned, or its
 * district). Then a unit broken here whose blocks all share one zone heals.
 * The break and the paint are one undo step: breakUnits leaves a pending
 * pre-break snapshot that the paint's ingest turns into the history entry.
 * Districts mode only. `paint` is the caller's mutate + ingest.
 * ponytail: candidates are the parent units in loaded tiles, so an area that
 * runs off-screen paints only its loaded part, and the area's outline is the
 * tiles' (simplified at low zoom, hence MIN_AREA_PAINT_ZOOM); a server-side
 * block/area crosswalk would make this exact and geometry-free (districtr_v2-c23).
 */
export const paintOverlayArea = async (
  map: MaplibreMap,
  area: MapGeoJSONFeature,
  paint: (features: MapGeoJSONFeature[]) => void
) => {
  const {mapDocument, mapLock, setMapLock, setNotification, breakUnits} = useMapStore.getState();
  const overlayId = overlayIdOf(useMapControlsStore.getState().mapOptions.paintBy);
  if (inFlight || !mapDocument || mapLock || !overlayId || area.id == null) return;
  if (map.getZoom() < MIN_AREA_PAINT_ZOOM) {
    setNotification({
      importance: 2,
      message: 'Zoom in a little to paint a whole area: at this zoom its outline is too rough.',
      id: 'paint-area-zoom',
    });
    return;
  }
  inFlight = true;
  const lockReason = `Painting ${getOverlayName(overlayId) ?? 'area'}…`;
  setMapLock({isLocked: true, reason: lockReason});
  let brokenNow: string[] = [];
  try {
    const shape = toAreaShape(
      queryAreaFeatures(map, overlayId, String(area.id)).map(
        f => f.geometry as Polygon | MultiPolygon
      )
    );
    const {parent_layer: parentLayer, child_layer: childLayer} = mapDocument;

    // Candidate parents from the loaded tiles, bboxes merged across tile pieces.
    const candidates = new Map<string, {feature: MapGeoJSONFeature; box: BBox}>();
    map.querySourceFeatures(BLOCK_SOURCE_ID, {sourceLayer: parentLayer}).forEach(f => {
      const id = String(f.id);
      const box = bbox(f.geometry) as BBox;
      const seen = candidates.get(id);
      if (seen) {
        seen.box = [
          Math.min(seen.box[0], box[0]),
          Math.min(seen.box[1], box[1]),
          Math.max(seen.box[2], box[2]),
          Math.max(seen.box[3], box[3]),
        ];
      } else {
        // querySourceFeatures leaves source/sourceLayer unset; painting reads them.
        const feature = Object.assign(f, {source: BLOCK_SOURCE_ID, sourceLayer: parentLayer});
        candidates.set(id, {feature: feature as unknown as MapGeoJSONFeature, box});
      }
    });
    const near = [...candidates.entries()].filter(([, {box}]) =>
      shape.pieces.some(piece => bboxesOverlap(piece.box, box))
    );
    if (!near.length) return;

    // Unit centers from the point parquet: tile geometry is clipped at tile edges.
    const points = await getPointSelectionData({
      layer: parentLayer,
      columns: ['path', 'x', 'y'],
      source: BLOCK_SOURCE_ID,
      filterIds: new Set(near.map(([id]) => id)),
    });
    const pointOf = new Map(
      points.features.map(f => [String(f.properties?.path), f.geometry.coordinates])
    );

    const {shatterIds} = useAssignmentsStore.getState();
    const whole: MapGeoJSONFeature[] = [];
    const toBreak: string[] = [];
    const alreadyBroken: string[] = [];
    near.forEach(([id, {feature, box}]) => {
      const point = pointOf.get(id);
      if (!point) return;
      const unitClass = classifyUnit({box, point}, shape);
      if (unitClass === 'skip') return;
      if (shatterIds.parents.has(id)) alreadyBroken.push(id);
      else if (unitClass === 'whole' || !childLayer) whole.push(feature);
      else toBreak.push(id);
    });

    if (toBreak.length) {
      // Before the await: if breakUnits throws after recording the break, the
      // catch still heals these (healing ids that never broke does nothing).
      brokenNow = toBreak;
      const edges = await breakUnits(toBreak);
      if (!edges) return; // breakUnits notified
      // The break's shatter render clears the map lock on its next frame
      // (renderShatter); take it back after that render, through the fetch.
      map.once('render', () => {
        if (inFlight) useMapStore.getState().setMapLock({isLocked: true, reason: lockReason});
      });
    }

    // Blocks of the edge units: paint those whose center lies inside.
    const {parentToChild} = useAssignmentsStore.getState();
    const blockIds = new Set(
      [...brokenNow, ...alreadyBroken].flatMap(id => [...(parentToChild.get(id) ?? [])])
    );
    const blocks =
      childLayer && blockIds.size
        ? (
            await getPointSelectionData({
              layer: childLayer,
              columns: ['path', 'x', 'y', 'total_pop_20'],
              source: BLOCK_SOURCE_ID,
              filterIds: blockIds,
            })
          ).features
            // A unit healed meanwhile no longer has paintable blocks.
            .filter(f => useAssignmentsStore.getState().shatterIds.children.has(f.properties?.path))
            .filter(f => inArea(f.geometry.coordinates, shape))
            .map(
              f =>
                ({
                  ...f,
                  id: f.properties?.path,
                  source: BLOCK_SOURCE_ID,
                  sourceLayer: childLayer,
                }) as unknown as MapGeoJSONFeature
            )
        : [];

    // Locks, Forbid paint-over and the paint mask still apply.
    const features = filterFeatures({_features: [...whole, ...blocks]});
    if (features.length) paint(features);

    // Units broken here whose blocks all kept one zone go back to whole.
    if (brokenNow.length) {
      useAssignmentsStore
        .getState()
        .healParentsIfAllChildrenInSameZone({_parentIds: new Set(brokenNow)}, 'state');
    }
  } catch (error) {
    console.error(error);
    // Don't leave this click's units broken for nothing.
    if (brokenNow.length) {
      useAssignmentsStore
        .getState()
        .healParentsIfAllChildrenInSameZone({_parentIds: new Set(brokenNow)}, 'state');
    }
    setNotification({
      importance: 2,
      type: 'error',
      message: 'Painting this area failed. Please try again.',
      id: `paint-area-failed-${String(area.id)}`,
    });
  } finally {
    // breakUnits paused the undo recorder; the paint's ingest resumes it, but
    // not when nothing got painted.
    temporalManager.resume(MAP_MODES.DISTRICTS);
    // Only this click's lock: another lock is someone else's.
    if (useMapStore.getState().mapLock?.reason === lockReason) setMapLock(null);
    inFlight = false;
  }
};
