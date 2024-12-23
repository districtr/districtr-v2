import {MinGeoJSONFeature} from '../utils/GeometryWorker/geometryWorker.types';

class IdCache {
  cachedTileIndices: Set<string> = new Set();
  parents: Record<string, Partial<MinGeoJSONFeature>> = {};

  hasCached(index: string) {
    return this.cachedTileIndices.has(index);
  }

  loadFeatures(features: MinGeoJSONFeature[], tileIndex: string) {
    if (this.hasCached(tileIndex)) {
      return;
    } else {
      this.cachedTileIndices.add(tileIndex);
      features.forEach(feature => {
        if (feature.properties && feature.properties.path) {
          const id = feature.properties.path;
          if (!this.parents[id]) {
            this.parents[id] = {
              ...feature,
              geometry: undefined
            };
          }
        }
      });
    }
  }

  clear() {
    this.parents = {};
    this.cachedTileIndices.clear();
  }

  getFiltered(id: string) {
    const regex = new RegExp(`^${id}`);
    return Object.entries(this.parents).filter(([key]) => regex.test(key));
  }
}

export const parentIdCache = new IdCache();