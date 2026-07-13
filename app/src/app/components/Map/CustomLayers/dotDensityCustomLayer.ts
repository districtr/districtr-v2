import type {CustomLayerInterface, Map as MapLibreMap} from 'maplibre-gl';
import type {DotDensityTileBuffers} from '@/app/utils/DotDensityWorker/dotDensityWorker.types';
import {
  composeTileMatrix,
  gridLevelForZoom,
  peoplePerDotForLevel,
  tileKey,
  type TileID,
} from '@/app/utils/dotDensity/tileMath';
import {DOT_DENSITY_COLOR, DOT_DENSITY_DOT_RADIUS} from '@constants/demography/dotDensity';
import {compileProgram, DOT_DENSITY_FRAG, DOT_DENSITY_VERT} from './shaders';

type GpuTile = {
  id: TileID;
  vao: WebGLVertexArrayObject;
  buffers: WebGLBuffer[];
  indexCount: number;
};

export const DOT_DENSITY_LAYER_ID = 'dot-density-custom';

/**
 * MapLibre CustomLayerInterface that renders procedurally stippled population
 * dots. Geometry arrives as tessellated tile buffers (from DotDensityWorker);
 * all dot generation happens in the fragment shader.
 */
export class DotDensityCustomLayer implements CustomLayerInterface {
  id = DOT_DENSITY_LAYER_ID;
  type = 'custom' as const;
  renderingMode = '2d' as const;

  private map: MapLibreMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private tiles = new Map<string, GpuTile>();
  private attribs = {pos: 0, density: 0};
  private uniforms: Record<string, WebGLUniformLocation | null> = {};

  onAdd(map: MapLibreMap, glCtx: WebGLRenderingContext | WebGL2RenderingContext) {
    // maplibre-gl 4.x always renders with WebGL2; the union in the type is legacy
    const gl = glCtx as WebGL2RenderingContext;
    this.map = map;
    this.gl = gl;
    this.program = compileProgram(gl, DOT_DENSITY_VERT, DOT_DENSITY_FRAG);
    this.attribs = {
      pos: gl.getAttribLocation(this.program, 'a_pos'),
      density: gl.getAttribLocation(this.program, 'a_density'),
    };
    for (const name of [
      'u_matrix',
      'u_cellOrigin',
      'u_cellsPerTile',
      'u_cellAreaWorld',
      'u_peoplePerDot',
      'u_dotRadius',
      'u_color',
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

  setTileData(id: TileID, data: DotDensityTileBuffers) {
    const gl = this.gl;
    if (!gl || !this.program) return;
    const key = tileKey(id);
    this.removeTile(key);

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const posBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.attribs.pos);
    gl.vertexAttribPointer(this.attribs.pos, 2, gl.FLOAT, false, 0, 0);

    const densityBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, densityBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.densities, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.attribs.density);
    gl.vertexAttribPointer(this.attribs.density, 1, gl.FLOAT, false, 0, 0);

    const idxBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
    this.tiles.set(key, {
      id,
      vao,
      buffers: [posBuf, densityBuf, idxBuf],
      indexCount: data.indices.length,
    });
  }

  removeTile(key: string) {
    const gl = this.gl;
    const tile = this.tiles.get(key);
    if (!gl || !tile) return;
    gl.deleteVertexArray(tile.vao);
    for (const buf of tile.buffers) gl.deleteBuffer(buf);
    this.tiles.delete(key);
  }

  render(glCtx: WebGLRenderingContext | WebGL2RenderingContext, matrix: number[] | Float32Array) {
    const gl = glCtx as WebGL2RenderingContext;
    if (!this.program || !this.map || !this.tiles.size) return;
    const zoom = this.map.getZoom();
    const n = gridLevelForZoom(zoom);
    const peoplePerDot = peoplePerDotForLevel(n);

    gl.useProgram(this.program);
    gl.enable(gl.BLEND);
    // Premultiplied alpha, matching maplibre's compositing expectations
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    gl.uniform1f(this.uniforms.u_cellAreaWorld, 4 ** -n);
    gl.uniform1f(this.uniforms.u_peoplePerDot, peoplePerDot);
    gl.uniform1f(this.uniforms.u_dotRadius, DOT_DENSITY_DOT_RADIUS);
    gl.uniform4fv(this.uniforms.u_color, DOT_DENSITY_COLOR);

    for (const tile of this.tiles.values()) {
      const cellsPerTile = 2 ** (n - tile.id.z);
      gl.uniformMatrix4fv(this.uniforms.u_matrix, false, composeTileMatrix(matrix, tile.id));
      gl.uniform2f(
        this.uniforms.u_cellOrigin,
        tile.id.x * cellsPerTile,
        tile.id.y * cellsPerTile
      );
      gl.uniform1f(this.uniforms.u_cellsPerTile, cellsPerTile);
      gl.bindVertexArray(tile.vao);
      gl.drawElements(gl.TRIANGLES, tile.indexCount, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
  }
}
