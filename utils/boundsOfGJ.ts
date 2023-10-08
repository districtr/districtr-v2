/**
 * 
 * @param gj 
 * @returns 
 */

export function boundsOfGJ(gj : any) {
    var coords, bbox;
    if (!gj.hasOwnProperty('type')) return;
    coords = getCoordinatesDump(gj);
    bbox = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY,];
    return coords.reduce(function (prev : any, coord : any) {
      return [
        Math.min(coord[0], prev[0]),
        Math.min(coord[1], prev[1]),
        Math.max(coord[0], prev[2]),
        Math.max(coord[1], prev[3])
      ];
    }, bbox);
  };

function getCoordinatesDump(gj : any) : any {
    var coords;
    if (gj.type == 'Point') {
      coords = [gj.coordinates];
    } else if (gj.type == 'LineString' || gj.type == 'MultiPoint') {
      coords = gj.coordinates;
    } else if (gj.type == 'Polygon' || gj.type == 'MultiLineString') {
      coords = gj.coordinates.reduce(function (dump : any, part : any) {
        return dump.concat(part);
      }, []);
    } else if (gj.type == 'MultiPolygon') {
      coords = gj.coordinates.reduce(function (dump : any, poly : any) {
        return dump.concat(poly.reduce(function (points : any, part : any) {
          return points.concat(part);
        }, []));
      }, []);
    } else if (gj.type == 'Feature') {
      coords = getCoordinatesDump(gj.geometry);
    } else if (gj.type == 'GeometryCollection') {
      coords = gj.geometries.reduce(function (dump : any, g : any) {
        return dump.concat(getCoordinatesDump(g));
      }, []);
    } else if (gj.type == 'FeatureCollection') {
      coords = gj.features.reduce(function (dump : any, f : any) {
        return dump.concat(getCoordinatesDump(f));
      }, []);
    }
    return coords;
  }