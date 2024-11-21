export type GeometryWorkerClass = {
  parseGeometry: (features: GeoJSON.Feature[]) => {dissolved: GeoJSON.FeatureCollection, centroids: GeoJSON.FeatureCollection}
}