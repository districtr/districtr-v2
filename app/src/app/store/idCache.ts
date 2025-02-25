import GeometryWorker from '../utils/GeometryWorker';
import {MinGeoJSONFeature} from '../utils/GeometryWorker/geometryWorker.types';

class IdCache {
  cachedTileIndices: Set<string> = new Set();
  cachedChildParents: Set<string> = new Set();
  entries: Record<string, Partial<MinGeoJSONFeature>> = {};
  children: string[] = [];
  parents: string[] = [];  

  hasCached(index: string) {
    return this.cachedTileIndices.has(index) || this.cachedChildParents.has(index);
  }
  updateFeatures(idsToRemove: string[], idsToFetch: string[]) {
    idsToRemove.forEach(id => {
      delete this.entries[id];
    });
    GeometryWorker?.getPropsById(idsToFetch).then((features) => {
      this.loadFeatures(features);
    })
  }
  loadFeatures(features: MinGeoJSONFeature[], index: string | undefined = undefined, isChild: boolean = false) {
    if (index && this.hasCached(index)) {
      return;
    } else {
      if (index && isChild) {
        this.cachedChildParents.add(index);
      } else if (index) {
        this.cachedTileIndices.add(index);
      }
      features.forEach(feature => {
        if (feature.properties && feature.properties.path) {
          const id = feature.properties.path;
          if (!this.entries[id]) {
            this.entries[id] = {
              ...feature,
              geometry: undefined,
            };
          }
        }
      });
    }
  }

  handleShatterHeal(
    parentIds: string[],
    childIds: string[],
  ) {
    const idsToRemove:string[] = this.children.filter(id => !childIds.includes(id));
    const idsToFetch:string[] = this.parents.filter(id => !parentIds.includes(id));
    childIds.forEach(id => !this.children.includes(id) && idsToFetch.push(id));
    parentIds.forEach(id => !this.parents.includes(id) && idsToRemove.push(id));
    this.updateFeatures(idsToRemove, idsToFetch)
    this.children = childIds;
    this.parents = parentIds;
    
  }

  clear() {
    this.entries = {};
    this.cachedTileIndices.clear();
  }

  getTotalPopSeen(exclude: Set<string>) {
    let total = 0;
    for (const [id, feature] of Object.entries(this.entries)) {
      if (!exclude.has(id) && feature.properties && feature.properties.total_pop) {
        total += +feature.properties.total_pop;
      }
    }
    return total;
  }

  getFiltered(id: string) {
    const regex = new RegExp(`^${id}`);
    return Object.entries(this.entries).filter(([key]) => regex.test(key));
  }
}

export const idCache = new IdCache();
