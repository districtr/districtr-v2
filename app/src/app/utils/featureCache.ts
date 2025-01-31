"use client"
import RBush from 'rbush';

type Data = {
  path: string;
  [key: string]: unknown;
}

type RBushBbox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

class FeatureCache {
  private tree = new RBush();
  
  features: Record<string, {
    properties: Data;
    id: string;
    source: string;
    sourceLayer: string;
  }> = {};

  addFeatures(
    features: Record<string,{
    props: Data;
    bounds: [number, number, number, number][];
  }>,
  source: string,
  sourceLayer: string
) {
    // const t0 = performance.now();
    const formattedData = Object.values(features).map(({props, bounds}) => {
      this.features[props.path] = {
        properties: props,
        id: props.path,
        source,
        sourceLayer,
      };
      return bounds.map((bbox) => {
        return {
          minX: bbox[0],
          minY: bbox[1],
          maxX: bbox[2],
          maxY: bbox[3],
          path: props.path,
        }
      })
    }).flat()
    this.tree.load(formattedData)
    // const t1 = performance.now();
    // console.log(`FeatureCache.addFeatures took ${t1 - t0} milliseconds.`)
  }

  searchRTree(bbox: RBushBbox) {
    // const t0 = performance.now();
    const results = this.tree.search(bbox);
    // const t1 = performance.now();
    // console.log(`FeatureCache.getFeaturesInBBox took ${t1 - t0} milliseconds.`)
    // @ts-ignore
    return results
  }

  searchFeaturesinBbox(bbox: RBushBbox) {
    const t0 = performance.now();
    const entries = this.searchRTree(bbox)
    const results = []
    const foundIds = new Set();
    for (const entry of entries) {
      // @ts-ignore
      const id = entry.path;
      if (!foundIds.has(id)) {
        foundIds.add(id);
        results.push(this.features[id]);
      }
    }
    const t1 = performance.now();
    // console.log(`FeatureCache.getFeaturesInBBox took ${t1 - t0} milliseconds.`)
    return results
  }

  clear(){
    this.tree.clear();
    this.features = {};
  }
}

export const featureCache = new FeatureCache();