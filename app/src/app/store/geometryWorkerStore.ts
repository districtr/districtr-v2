import {create} from 'zustand';
import {EMPTY_FT_COLLECTION} from '../constants/layers';

type GeometryWorkerStore = {
  centroids: GeoJSON.FeatureCollection;
  outlines: GeoJSON.FeatureCollection;
  setGeometry: (data: {
    centroids?: GeometryWorkerStore['centroids'];
    outlines?: GeometryWorkerStore['outlines'];
  }) => void;
};

export const useGeometryWorkerStore = create<GeometryWorkerStore>((set, get) => {
  return {
    centroids: EMPTY_FT_COLLECTION,
    outlines: EMPTY_FT_COLLECTION,
    setGeometry: data => {
      const {centroids, outlines} = get();
      set({
        centroids: data.centroids ?? centroids,
        outlines: data.outlines ?? outlines,
      });
    },
  };
});
