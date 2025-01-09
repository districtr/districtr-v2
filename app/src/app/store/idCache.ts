import {MinGeoJSONFeature} from '../utils/GeometryWorker/geometryWorker.types';

class IdCache {
  cachedTileIndices: Set<string> = new Set();
  cachedChildParents: Set<string> = new Set();
  entries: Record<string, Partial<MinGeoJSONFeature>> = {};

  hasCached(index: string) {
    return this.cachedTileIndices.has(index) || this.cachedChildParents.has(index);
  }

  loadFeatures(features: MinGeoJSONFeature[], index: string, isChild: boolean=false) {
    if (this.hasCached(index)) {
      return;
    } else {
      if (isChild) {
        this.cachedChildParents.add(index);
      } else {
        this.cachedTileIndices.add(index);
      }
      features.forEach(feature => {
        if (feature.properties && feature.properties.path) {
          const id = feature.properties.path;
          if (!this.entries[id]) {
            this.entries[id] = {
              ...feature,
              geometry: undefined
            };
          }
        }
      });
    }
  }
  
  heal(parentId: string, childIds: string[]){
    this.cachedChildParents.delete(parentId);
    childIds.forEach(childId => {
      delete this.entries[childId];
    });
  }

  clear() {
    this.entries = {};
    this.cachedTileIndices.clear();
  }

  getTotalPopSeen(exclude: Set<string>){
    let total = 0;
    for (const [id, feature] of Object.entries(this.entries)) {
      if (!exclude.has(id) && feature.properties && feature.properties.total_pop) {
        total += +feature.properties.total_pop;
      }
    }
    return total
  }

  getFiltered(id: string) {
    const regex = new RegExp(`^${id}`);
    return Object.entries(this.entries).filter(([key]) => regex.test(key));
  }
}

export const idCache = new IdCache();