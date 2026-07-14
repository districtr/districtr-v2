import type {CustomLayerInterface, Map as MapLibreMap} from 'maplibre-gl';
import type {DotDensityTileBuffers} from '@/app/utils/DotDensityWorker/dotDensityWorker.types';
import {
  composeTileMatrix,
  gridLevelForZoom,
  peoplePerDotForLevel,
  type TileID,
} from '@/app/utils/dotDensity/tileMath';
import {
  DOT_DENSITY_DOT_RADIUS,
  DOT_DENSITY_TEXTURE_WIDTH,
  hexToRgb01,
} from '@constants/demography/dotDensity';
import {compileProgram, DOT_DENSITY_FRAG, DOT_DENSITY_VERT} from './shaders';

type GpuTile = {
  id: TileID;
  vao: WebGLVertexArrayObject;
  buffers: WebGLBuffer[];
  texture: WebGLTexture;
  indexCount: number;
  /** Feature `path` ids and tile-clipped areas, for density texture rebuilds. */
  paths: string[];
  areas: Float64Array;
};

export const DOT_DENSITY_LAYER_ID = 'dot-density-custom';

/**
 * MapLibre CustomLayerInterface that renders procedurally stippled population
 * dots colored by race category. Geometry arrives as tessellated tile buffers
 * (from DotDensityWorker); per-feature category densities live in a per-tile
 * RGBA32F texture (2 texels per feature) supplied by the host component.
 * All dot generation happens in the fragment shader.
 */
export class DotDensityCustomLayer implements CustomLayerInterface {
  id = DOT_DENSITY_LAYER_ID;
  type = 'custom' as const;
  renderingMode = '2d' as const;

  private map: MapLibreMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private tiles = new Map<string, GpuTile>();
  private attribs = {pos: 0, fidx: 0};
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private paletteFlat = new Float32Array(18);
  private densityFactor = 1;
  private sizeFactor = 1;
  private opacity = 1;

  /** Category colors in texture-slot order; padded to the shader's 6 slots. */
  setPalette(hexes: string[]) {
    const flat = new Float32Array(18);
    hexes.slice(0, 6).forEach((hex, i) => flat.set(hexToRgb01(hex), i * 3));
    this.paletteFlat = flat;
  }

  /** User multiplier on dots-per-people (higher = more dots). */
  setDensityFactor(factor: number) {
    this.densityFactor = factor > 0 ? factor : 1;
  }

  /** User multiplier on dot radius; scaled radius stays under one cell. */
  setSizeFactor(factor: number) {
    this.sizeFactor = factor > 0 ? factor : 1;
  }

  setOpacity(opacity: number) {
    this.opacity = Math.min(1, Math.max(0, opacity));
  }

  onAdd(map: MapLibreMap, glCtx: WebGLRenderingContext | WebGL2RenderingContext) {
    // maplibre-gl 4.x always renders with WebGL2; the union in the type is legacy
    const gl = glCtx as WebGL2RenderingContext;
    this.map = map;
    this.gl = gl;
    this.program = compileProgram(gl, DOT_DENSITY_VERT, DOT_DENSITY_FRAG);
    this.attribs = {
      pos: gl.getAttribLocation(this.program, 'a_pos'),
      fidx: gl.getAttribLocation(this.program, 'a_fidx'),
    };
    for (const name of [
      'u_matrix',
      'u_density',
      'u_texWidth',
      'u_cellOrigin',
      'u_cellsPerTile',
      'u_cellAreaWorld',
      'u_peoplePerDot',
      'u_dotRadius',
      'u_palette',
      'u_opacity',
    ]) {
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    }
  }

  onRemove() {
    const gl = this.gl;
    if (gl) {
      for (const key of Array.from(this.tiles.keys())) this.removeTile(key);
      if (this.program) gl.deleteProgram(this.program);
    }
    this.program = null;
    this.gl = null;
    this.map = null;
  }

  hasTile(key: string) {
    return this.tiles.has(key);
  }

  tileKeys() {
    return Array.from(this.tiles.keys());
  }

  /** Iterate resident tiles' feature identity, for density texture rebuilds. */
  forEachTile(fn: (key: string, paths: string[], areas: Float64Array) => void) {
    for (const [key, tile] of this.tiles) fn(key, tile.paths, tile.areas);
  }

  setTileData(key: string, id: TileID, data: DotDensityTileBuffers) {
    const gl = this.gl;
    if (!gl || !this.program) return;
    this.removeTile(key);

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const posBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.attribs.pos);
    gl.vertexAttribPointer(this.attribs.pos, 2, gl.FLOAT, false, 0, 0);

    const fidxBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, fidxBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.featureIndices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.attribs.fidx);
    gl.vertexAttribPointer(this.attribs.fidx, 1, gl.FLOAT, false, 0, 0);

    const idxBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);

    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    this.tiles.set(key, {
      id,
      vao,
      buffers: [posBuf, fidxBuf, idxBuf],
      texture,
      indexCount: data.indices.length,
      paths: data.paths,
      areas: data.areas,
    });
  }

  /**
   * Upload a tile's density texel data: RGBA32F, 2 texels per feature,
   * DOT_DENSITY_TEXTURE_WIDTH texels wide. Zero-length data clears the tile's
   * dots (all densities zero → every fragment discards).
   */
  setTileDensities(key: string, texels: Float32Array) {
    const gl = this.gl;
    const tile = this.tiles.get(key);
    if (!gl || !tile) return;
    const width = DOT_DENSITY_TEXTURE_WIDTH;
    const height = Math.max(1, Math.ceil(texels.length / 4 / width));
    const padded = new Float32Array(width * height * 4);
    padded.set(texels);
    gl.bindTexture(gl.TEXTURE_2D, tile.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, padded);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  removeTile(key: string) {
    const gl = this.gl;
    const tile = this.tiles.get(key);
    if (!gl || !tile) return;
    gl.deleteVertexArray(tile.vao);
    for (const buf of tile.buffers) gl.deleteBuffer(buf);
    gl.deleteTexture(tile.texture);
    this.tiles.delete(key);
  }

  render(glCtx: WebGLRenderingContext | WebGL2RenderingContext, matrix: number[] | Float32Array) {
    const gl = glCtx as WebGL2RenderingContext;
    if (!this.program || !this.map || !this.tiles.size) return;
    const zoom = this.map.getZoom();
    const n = gridLevelForZoom(zoom);
    const peoplePerDot = peoplePerDotForLevel(n) / this.densityFactor;

    gl.useProgram(this.program);
    gl.enable(gl.BLEND);
    // Premultiplied alpha, matching maplibre's compositing expectations
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    gl.uniform1f(this.uniforms.u_cellAreaWorld, 4 ** -n);
    gl.uniform1f(this.uniforms.u_peoplePerDot, peoplePerDot);
    gl.uniform1f(
      this.uniforms.u_dotRadius,
      Math.min(0.98, DOT_DENSITY_DOT_RADIUS * this.sizeFactor)
    );
    gl.uniform3fv(this.uniforms.u_palette, this.paletteFlat);
    gl.uniform1f(this.uniforms.u_opacity, this.opacity);
    gl.uniform1i(this.uniforms.u_texWidth, DOT_DENSITY_TEXTURE_WIDTH);
    gl.uniform1i(this.uniforms.u_density, 0);
    gl.activeTexture(gl.TEXTURE0);

    for (const tile of this.tiles.values()) {
      const cellsPerTile = 2 ** (n - tile.id.z);
      gl.uniformMatrix4fv(this.uniforms.u_matrix, false, composeTileMatrix(matrix, tile.id));
      gl.uniform2f(
        this.uniforms.u_cellOrigin,
        tile.id.x * cellsPerTile,
        tile.id.y * cellsPerTile
      );
      gl.uniform1f(this.uniforms.u_cellsPerTile, cellsPerTile);
      gl.bindTexture(gl.TEXTURE_2D, tile.texture);
      gl.bindVertexArray(tile.vao);
      gl.drawElements(gl.TRIANGLES, tile.indexCount, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
}
