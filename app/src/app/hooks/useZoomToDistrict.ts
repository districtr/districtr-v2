import {useCallback} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useMapStore} from '@/app/store/mapStore';
import {PUBLIC_SOURCE_ID} from '@constants/map/layerIds';

function geomBbox(geom: GeoJSON.Geometry): [number, number, number, number] | null {
  const coords: number[][] = [];
  const collect = (g: GeoJSON.Geometry) => {
    if (g.type === 'Polygon') g.coordinates.forEach(ring => ring.forEach(c => coords.push(c)));
    else if (g.type === 'MultiPolygon')
      g.coordinates.forEach(poly => poly.forEach(ring => ring.forEach(c => coords.push(c))));
    else if (g.type === 'GeometryCollection') g.geometries.forEach(collect);
  };
  collect(geom);
  if (!coords.length) return null;
  const lngs = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

export function useZoomToDistrict() {
  const mapDocument = useMapStore(state => state.mapDocument);
  const mapRef = useMapStore(state => state.getMapRef());
  const queryClient = useQueryClient();

  return useCallback(
    (zone: number) => {
      const data = queryClient.getQueryData<{geojsonFeatures: GeoJSON.Feature[]}>(
        [PUBLIC_SOURCE_ID, mapDocument?.public_id]
      );
      const feature = data?.geojsonFeatures.find(f => f.properties?.zone === zone);
      if (!feature?.geometry) return;
      const bbox = geomBbox(feature.geometry);
      if (!bbox) return;
      mapRef?.fitBounds(bbox, {padding: 60, duration: 500});
    },
    [mapDocument?.public_id, mapRef, queryClient]
  );
}
