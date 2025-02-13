'use client';
import RBush from 'rbush';

export type Data = {
  path: string;
  [key: string]: unknown;
};

export type RBushBbox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

class FeatureCache {
  private tree = new RBush();

  features: Record<
    string,
    {
      properties: Data;
      id: string;
      source: string;
      sourceLayer: string;
    }
  > = {};

  childFeatures: Record<
    string,
    {
      properties: Data;
      id: string;
      source: string;
      sourceLayer: string;
      geometry: GeoJSON.Geometry;
    }
  > = {};

  addFeatures(
    features: Record<
      string,
      {
        properties: Data;
        bboxes: RBushBbox[];
      }
    >,
    source: string,
    sourceLayer: string
  ) {
    // const t0 = performance.now();
    const formattedData = Object.entries(features)
      .map(([id, {properties, bboxes}]) => {
        this.features[id] = {
          id,
          properties: {
            ...properties,
            path: id,
          },
          source,
          sourceLayer,
        };
        return bboxes.map(bbox => {
          return {
            ...bbox,
            path: id,
          };
        });
      })
      .flat();
    this.tree.load(formattedData);
    // const t1 = performance.now();
    // console.log(`FeatureCache.addFeatures took ${t1 - t0} milliseconds.`)
  }
  // addChildFeatures(
  //   features: Record<
  //     string,
  //     {
  //       properties: Data;
  //       bboxes: RBushBbox[];
  //       geometry: GeoJSON.Geometry;
  //     }
  //   >,
  //   source: string,
  //   sourceLayer: string
  // ) {
  //   const formattedData: any = [];
  //   Object.entries(features).forEach(([id, {properties, bboxes, geometry}]) => {
  //     this.childFeatures[id] = {
  //       properties: {
  //         ...properties,
  //         id,
  //       },
  //       id,
  //       source,
  //       sourceLayer,
  //       geometry: geometry,
  //     };
  //     formattedData.push({
  //       path: id,
  //       isChild: true,
  //       ...bboxes[0],
  //     });
  //   });
  //   this.tree.load(formattedData);
  // }

  searchRTree(bbox: RBushBbox) {
    const results = this.tree.search(bbox);
    return results;
  }

  searchFeaturesinBbox(bbox: RBushBbox) {
    const entries = this.searchRTree(bbox);
    const results = [];
    const foundIds = new Set();
    for (const entry of entries) {
      // @ts-ignore
      const id = entry.path;
      if (!foundIds.has(id)) {
        foundIds.add(id);
        results.push(this.features[id]);
      }
    }
    return results;
  }

  searchIds(prefix: string): [string, Data][] {
    const ids = Object.keys(this.features).filter(id => id.startsWith(prefix));
    return ids.map(id => [id, this.features[id].properties]);
  }

  clear() {
    this.tree.clear();
    this.features = {};
    this.childFeatures = {};
  }
}

export const featureCache = new FeatureCache();
