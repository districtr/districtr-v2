import {MapGeoJSONFeature} from 'maplibre-gl';
import {
  booleanIntersects,
  booleanPointInPolygon,
  area,
  bbox,
  coordAll,
  intersect,
} from '@turf/turf';
import {MultiPolygon, Polygon} from 'geojson';

const MINIMUM_INTERSECTION_AREA_RATIO = 0.25;

type BBox = ReturnType<typeof bbox>;
export const bboxesOverlap = (a: BBox, b: BBox) =>
  a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

type Shape = Pick<MapGeoJSONFeature, 'geometry'>;

/** Whether a unit counts as inside an area (given as one or more polygon
 * pieces, e.g. one overlay feature split across tiles): a point touches it,
 * or more than a quarter of a polygon's area overlaps it. Shared by the paint
 * mask filter and painting by overlay area. */
export const isMostlyInside = (f: Shape, areas: Shape[]): boolean => {
  if (f.geometry.type === 'Point') {
    return areas.some(a => booleanIntersects(a.geometry, f.geometry));
  }
  const unitBox = bbox(f.geometry);
  const nearby = areas.filter(a => bboxesOverlap(bbox(a.geometry), unitBox));
  if (!nearby.length) return false;
  // Fast path: a unit whose every vertex lies in one piece is inside it, with
  // no polygon clipping (turf's intersect is ~100x slower; most units of an
  // area are interior, only those on its edge need the area ratio).
  const vertices = coordAll(f.geometry);
  if (
    nearby.some(a =>
      vertices.every(v => booleanPointInPolygon(v, a.geometry as Polygon | MultiPolygon))
    )
  ) {
    return true;
  }
  const geomArea = area(f.geometry);
  let clippedArea = 0;
  for (const a of nearby) {
    const clipped = intersect({
      type: 'FeatureCollection',
      features: [
        {type: 'Feature', geometry: a.geometry as Polygon | MultiPolygon, properties: {}},
        {type: 'Feature', geometry: f.geometry as Polygon | MultiPolygon, properties: {}},
      ],
    });
    if (clipped) {
      clippedArea += area(clipped.geometry);
      if (clippedArea / geomArea > MINIMUM_INTERSECTION_AREA_RATIO) return true;
    }
  }
  return false;
};
