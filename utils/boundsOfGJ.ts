/**
 * Takes an object with type attribute of Point, LineString, Multipoint,
 * MultilineString, Polygon, Multipolygon, Feature, GeometryCollection,
 * and FeatureCollection.
 *
 * Used to find values to construct the southwestern corner and northeastern corner
 * of a shape for MaxBox GL JS fitBounds.
 *
 * @param gj
 * @returns {number[]}  [minimum x, minumum y, maximum x, maximum y]
 * @see Original Districtr reference : {@link https://github.com/uchicago-dsi/districtr-legacy/blob/e88ef1a8be7e40d3a7a00360dc95fd4239dd6c43/src/utils.js}
 */

export function boundsOfGJ(gj: any): number[] | undefined {
  var coords, bbox;
  if (!gj.hasOwnProperty('type')) return;
  coords = getCoordinatesDump(gj);
  bbox = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  return coords.reduce(function (prev: any, coord: any) {
    return [
      Math.min(coord[0], prev[0]),
      Math.min(coord[1], prev[1]),
      Math.max(coord[0], prev[2]),
      Math.max(coord[1], prev[3]),
    ];
  }, bbox);
}

function getCoordinatesDump(gj: any): any {
  var coords;
  if (gj.type == 'Point') {
    coords = [gj.coordinates];
  } else if (gj.type == 'LineString' || gj.type == 'MultiPoint') {
    coords = gj.coordinates;
  } else if (gj.type == 'Polygon' || gj.type == 'MultiLineString') {
    coords = gj.coordinates.reduce(function (dump: any, part: any) {
      return dump.concat(part);
    }, []);
  } else if (gj.type == 'MultiPolygon') {
    coords = gj.coordinates.reduce(function (dump: any, poly: any) {
      return dump.concat(
        poly.reduce(function (points: any, part: any) {
          return points.concat(part);
        }, [])
      );
    }, []);
  } else if (gj.type == 'Feature') {
    coords = getCoordinatesDump(gj.geometry);
  } else if (gj.type == 'GeometryCollection') {
    coords = gj.geometries.reduce(function (dump: any, g: any) {
      return dump.concat(getCoordinatesDump(g));
    }, []);
  } else if (gj.type == 'FeatureCollection') {
    coords = gj.features.reduce(function (dump: any, f: any) {
      return dump.concat(getCoordinatesDump(f));
    }, []);
  }
  return coords;
}
