/** Transferable GPU-ready buffers for one decoded+tessellated vector tile. */
export type DotDensityTileBuffers = {
  /** Tile-local vertex positions in [0,1] (buffered geometry may exceed slightly), interleaved x,y. */
  positions: Float32Array;
  /** Triangle indices into positions. */
  indices: Uint32Array;
  /** Per-vertex population density (people per mercator-world-unit²), constant within a feature. */
  densities: Float32Array;
  /** Number of features that contributed geometry (debug/stats). */
  featureCount: number;
};

export type DotDensityWorkerClass = {
  /** Point the worker at a PMTiles archive and source-layer; resets nothing else. */
  init: (tilesetUrl: string, sourceLayer: string, populationColumn?: string) => void;
  /** Fetch, decode, and tessellate one tile. Null when the tile or layer is absent. */
  getTileBuffers: (z: number, x: number, y: number) => Promise<DotDensityTileBuffers | null>;
};
