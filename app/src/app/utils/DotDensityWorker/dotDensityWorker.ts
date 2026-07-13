import {expose, transfer} from 'comlink';
import {PMTiles} from 'pmtiles';
import {VectorTile, classifyRings} from '@mapbox/vector-tile';
import {PbfReader} from 'pbf';
import earcut, {flatten} from 'earcut';
import type {DotDensityTileBuffers, DotDensityWorkerClass} from './dotDensityWorker.types';

type Ring = Array<{x: number; y: number}>;

/** Shoelace sum in MVT screen coords; sign depends on winding convention. */
const signedArea = (ring: Ring) => {
  let sum = 0;
  for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
    sum += (ring[i].x - ring[j].x) * (ring[i].y + ring[j].y);
  }
  return sum / 2;
};

class DotDensityWorker implements DotDensityWorkerClass {
  private pmtiles: PMTiles | null = null;
  private tilesetUrl = '';
  private sourceLayer = '';

  init(tilesetUrl: string, sourceLayer: string) {
    if (!this.pmtiles || this.tilesetUrl !== tilesetUrl) {
      this.pmtiles = new PMTiles(tilesetUrl);
      this.tilesetUrl = tilesetUrl;
    }
    this.sourceLayer = sourceLayer;
  }

  async getTileBuffers(z: number, x: number, y: number): Promise<DotDensityTileBuffers | null> {
    if (!this.pmtiles || !this.sourceLayer) {
      throw new Error(`not initialized url=${this.tilesetUrl} layer=${this.sourceLayer}`);
    }
    const resp = await this.pmtiles.getZxy(z, x, y);
    // Absent tiles (outside the state's extent) are routine, not an error
    if (!resp?.data) return null;
    const tile = new VectorTile(new PbfReader(new Uint8Array(resp.data)));
    const layer = tile.layers[this.sourceLayer];
    if (!layer) {
      throw new Error(
        `missing layer ${this.sourceLayer}; tile has [${Object.keys(tile.layers).join(', ')}]`
      );
    }

    const positions: number[] = [];
    const indices: number[] = [];
    const featureIndices: number[] = [];
    const paths: string[] = [];
    const areas: number[] = [];
    // Tile-local area × 4^-z = area in mercator world units ([0,1]² world)
    const tileToWorldArea = 4 ** -z;

    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      if (feature.type !== 3) continue; // polygons only
      const path = feature.properties.path;
      if (typeof path !== 'string') continue;
      const extent = feature.extent;
      const polygons = classifyRings(feature.loadGeometry()) as unknown as Ring[][];
      if (!polygons.length) continue;

      // ponytail: density uses the tile-clipped area, so features spanning
      // tiles overcount dots; Phase 4 replaces this with a cross-tile area registry
      let tileLocalArea = 0;
      const staged: Array<{verts: number[]; tris: number[]}> = [];
      for (const rings of polygons) {
        for (const ring of rings) {
          // exteriors dominate and holes carry the opposite sign
          tileLocalArea += signedArea(ring) / (extent * extent);
        }
        const {vertices, holes, dimensions} = flatten(
          rings.map(ring => ring.map(p => [p.x / extent, p.y / extent]))
        );
        const tris = earcut(vertices, holes, dimensions);
        if (tris.length) staged.push({verts: vertices, tris});
      }
      // abs: net magnitude is the polygon area regardless of winding convention
      const worldArea = Math.abs(tileLocalArea) * tileToWorldArea;
      if (worldArea <= 0 || !staged.length) continue;

      const fidx = paths.length;
      paths.push(path);
      areas.push(worldArea);
      for (const {verts, tris} of staged) {
        const base = positions.length / 2;
        for (let v = 0; v < verts.length; v += 2) {
          positions.push(verts[v], verts[v + 1]);
          featureIndices.push(fidx);
        }
        for (const t of tris) indices.push(base + t);
      }
    }

    if (!indices.length) return null;
    const result: DotDensityTileBuffers = {
      positions: new Float32Array(positions),
      indices: new Uint32Array(indices),
      featureIndices: new Float32Array(featureIndices),
      paths,
      areas: new Float64Array(areas),
    };
    return transfer(result, [
      result.positions.buffer,
      result.indices.buffer,
      result.featureIndices.buffer,
      result.areas.buffer,
    ]);
  }
}

expose(new DotDensityWorker());
