/** Transferable GPU-ready buffers for one decoded+tessellated vector tile. */
export type DotDensityTileBuffers = {
  /** Tile-local vertex positions in [0,1] (buffered geometry may exceed slightly), interleaved x,y. */
  positions: Float32Array;
  /** Triangle indices into positions. */
  indices: Uint32Array;
  /** Per-vertex feature index into paths/areas (constant within a feature). */
  featureIndices: Float32Array;
  /** Feature `path` ids, indexed by feature index. */
  paths: string[];
  /** Per-feature tile-clipped polygon area in mercator world units ([0,1]² world). */
  areas: Float64Array;
};

export type DotDensityWorkerClass = {
  /** Point the worker at a PMTiles archive and source-layer. */
  init: (tilesetUrl: string, sourceLayer: string) => void;
  /** Fetch, decode, and tessellate one tile. Null when the tile or layer is absent. */
  getTileBuffers: (z: number, x: number, y: number) => Promise<DotDensityTileBuffers | null>;
};
