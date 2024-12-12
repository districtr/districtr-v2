import { MapGeoJSONFeature } from "maplibre-gl"

export type CentroidReturn = {dissolved: GeoJSON.FeatureCollection, centroids: GeoJSON.FeatureCollection}
export type MinGeoJSONFeature = Pick<MapGeoJSONFeature, 'type' | 'geometry' | 'properties' | 'sourceLayer'>
export type GeometryWorkerClass = {
  geometries: {[id: string]: MinGeoJSONFeature},
  loaded: boolean,
  updateProps: (entries: Array<[string, unknown]>) => void,
  loadGeometry: (features: MinGeoJSONFeature[] | string, idProp: string) => void,
  parseGeometry: (features: MinGeoJSONFeature[]) => CentroidReturn,
  parseFromView: (minLon: number, minLat: number, maxLon: number, maxLat: number) => CentroidReturn,
  getGeos: () => GeoJSON.FeatureCollection,
}