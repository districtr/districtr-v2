import {MapGeoJSONFeature} from 'maplibre-gl';
import {booleanIntersects, area, intersect} from '@turf/turf';
import {MultiPolygon, Polygon} from 'geojson';

const MINIMUM_INTERSECTION_AREA_RATIO = 0.25;

/** Whether a unit counts as inside an area (given as one or more polygon
 * pieces, e.g. one overlay feature split across tiles): a point touches it,
 * or more than a quarter of a polygon's area overlaps it. Shared by the paint
 * mask filter and painting by overlay area. */
export const isMostlyInside = (
  f: Pick<MapGeoJSONFeature, 'geometry'>,
  areas: Pick<MapGeoJSONFeature, 'geometry'>[]
): boolean => {
  if (f.geometry.type === 'Point') {
    return areas.some(a => booleanIntersects(a.geometry, f.geometry));
  }
  const geomArea = area(f.geometry);
  let clippedArea = 0;
  for (const a of areas) {
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
