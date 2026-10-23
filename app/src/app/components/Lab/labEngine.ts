import type {CustomLayerInterface, Map as MapLibreMap} from 'maplibre-gl';
import type {DotDensityTileBuffers} from '@/app/utils/DotDensityWorker/dotDensityWorker.types';
import {
  composeTileMatrix,
  gridLevelForZoom,
  latToMercY,
  lngToMercX,
  peoplePerDotForLevel,
  type TileID,
} from '@/app/utils/dotDensity/tileMath';
import {
  DOT_DENSITY_DOT_RADIUS,
  DOT_DENSITY_TEXTURE_WIDTH,
  hexToRgb01,
} from '@constants/demography/dotDensity';
import {compileProgram} from '@components/Map/CustomLayers/shaders';
import {
  BLUR_FRAG,
  FIELD_FRAG,
  FULLSCREEN_VERT,
  MASK_FRAG,
  PARTICLE_FRAG,
  PARTICLE_UPDATE_BODY,
  PARTICLE_VERT,
  PRELUDE,
  STREAK_FRAG,
  STREAK_VERT,
  TILE_VERT,
  TRAIL_FRAG,
  WATERSHED_INIT_FRAG,
  WATERSHED_JUMP_FRAG,
} from './labGlsl';
import type {LabMode} from './labModes';

type UniformInfo = {loc: WebGLUniformLocation; type: number; size: number};
type Prog = {program: WebGLProgram; uniforms: Map<string, UniformInfo>};
type Target = {fbo: WebGLFramebuffer; tex: WebGLTexture[]; w: number; h: number; fmt: number};
type UniformValue = number | ArrayLike<number> | WebGLTexture | undefined;
type Uniforms = Record<string, UniformValue>;
type GpuTile = {
  id: TileID;
  vao: WebGLVertexArrayObject;
  buffers: WebGLBuffer[];
  texture: WebGLTexture;
  indexCount: number;
  paths: string[];
  areas: Float64Array;
};
type StepResult = {a2s: number[]; S: number; cur: Target; old: Target; lastA2s: number[] | null};
type Particles = {
  S: number;
  state: [Target, Target];
  anchor: {lng: number; lat: number; z: number};
  frame: number;
  reset: boolean;
  lastA2s: number[] | null;
  trailFlip: boolean;
};

export const LAB_LAYER_ID = 'dot-lab';
/** Field values are people per world-unit² × 4^-20 (see labGlsl.ts). */
const FIELD_SCALE = 4 ** -20;

/**
 * 64² blue-noise ranks by greedy void insertion (the second phase of
 * Ulichney's void-and-cluster): each new rank goes to the pixel with the
 * least Gaussian "energy" from already-placed pixels, on a torus.
 */
const makeBlueNoise = (N = 64, sigma = 1.5) => {
  const n = N * N;
  const kernel = new Float64Array(n);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = Math.min(x, N - x);
      const dy = Math.min(y, N - y);
      kernel[y * N + x] = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
    }
  }
  const energy = new Float64Array(n);
  const rank = new Float32Array(n).fill(-1);
  const place = (i: number, r: number) => {
    rank[i] = r / n;
    const px = i % N;
    const py = (i / N) | 0;
    for (let y = 0; y < N; y++) {
      const ky = ((y - py + N) % N) * N;
      for (let x = 0; x < N; x++) energy[y * N + x] += kernel[ky + ((x - px + N) % N)];
    }
  };
  place(0, 0);
  for (let r = 1; r < n; r++) {
    let best = -1;
    let bestE = Infinity;
    for (let i = 0; i < n; i++) {
      if (rank[i] < 0 && energy[i] < bestE) {
        bestE = energy[i];
        best = i;
      }
    }
    place(best, r);
  }
  return rank;
};

/**
 * Dot density lab renderer: a MapLibre custom layer that rasterizes tile
 * polygons into a screen-space population field, blurs it, then runs the
 * active LabMode's shader (plus particle / watershed passes for sim modes).
 * Prototype quality: one class, no pooling beyond named targets.
 */
export class LabLayer implements CustomLayerInterface {
  id = LAB_LAYER_ID;
  type = 'custom' as const;
  renderingMode = '2d' as const;

  mode: LabMode | null = null;
  params: Record<string, number> = {};
  densityFactor = 1;
  fieldDs = 2;
  mouse: [number, number] = [-1e4, -1e4];
  onFrame?: (info: {ppd: number; mPerPx: number; error?: string}) => void;

  private map: MapLibreMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private progs = new Map<string, Prog | null>();
  private tiles = new Map<string, GpuTile>();
  private targets = new Map<string, Target>();
  private vao: WebGLVertexArrayObject | null = null;
  private noiseTex: WebGLTexture | null = null;
  private dummyTex: WebGLTexture | null = null;
  private backTex: {tex: WebGLTexture; w: number; h: number} | null = null;
  private fieldFmt = 0;
  private palette = new Float32Array(18);
  private ncat = 0;
  private t0 = performance.now();
  private lastT = 0;
  private particles: Particles | null = null;
  private lastError = '';

  setPalette(hexes: string[]) {
    const flat = new Float32Array(18);
    hexes.slice(0, 6).forEach((hex, i) => flat.set(hexToRgb01(hex), i * 3));
    this.palette = flat;
    this.ncat = Math.min(6, hexes.length);
  }

  setMode(mode: LabMode, params: Record<string, number>) {
    if (this.mode?.id !== mode.id) this.resetParticles();
    this.mode = mode;
    this.params = params;
    this.map?.triggerRepaint();
  }

  resetParticles() {
    if (this.particles) this.particles.reset = true;
  }

  onAdd(map: MapLibreMap, glCtx: WebGLRenderingContext | WebGL2RenderingContext) {
    const gl = glCtx as WebGL2RenderingContext;
    this.map = map;
    this.gl = gl;
    if (!gl.getExtension('EXT_color_buffer_float')) {
      this.lastError = 'EXT_color_buffer_float unavailable: float render targets unsupported';
    }
    this.fieldFmt = gl.getExtension('OES_texture_float_linear') ? gl.RGBA32F : gl.RGBA16F;
    this.vao = gl.createVertexArray();

    this.noiseTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, 64, 64, 0, gl.RED, gl.FLOAT, makeBlueNoise());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    this.dummyTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.dummyTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  onRemove() {
    const gl = this.gl;
    if (gl) {
      for (const key of Array.from(this.tiles.keys())) this.removeTile(key);
      this.targets.forEach(t => this.deleteTarget(t));
      this.progs.forEach(p => p && gl.deleteProgram(p.program));
      if (this.vao) gl.deleteVertexArray(this.vao);
      [this.noiseTex, this.dummyTex, this.backTex?.tex].forEach(t => t && gl.deleteTexture(t));
    }
    this.targets.clear();
    this.progs.clear();
    this.particles = null;
    this.backTex = null;
    this.gl = null;
    this.map = null;
  }

  // ---------------------------------------------------------------- tiles

  hasTile(key: string) {
    return this.tiles.has(key);
  }

  tileKeys() {
    return Array.from(this.tiles.keys());
  }

  forEachTile(fn: (key: string, paths: string[], areas: Float64Array) => void) {
    for (const [key, tile] of this.tiles) fn(key, tile.paths, tile.areas);
  }

  setTileData(key: string, id: TileID, data: DotDensityTileBuffers) {
    const gl = this.gl;
    if (!gl) return;
    this.removeTile(key);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const posBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const fidxBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, fidxBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.featureIndices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    const idxBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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

  /** RGBA32F, 2 texels per feature (cats 0-3 | cat 4, cat 5, total, 0), people per world unit². */
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
    tile.buffers.forEach(b => gl.deleteBuffer(b));
    gl.deleteTexture(tile.texture);
    this.tiles.delete(key);
  }

  // ---------------------------------------------------------------- gl helpers

  private prog(key: string, vs: string, fs: string): Prog | null {
    const gl = this.gl!;
    if (this.progs.has(key)) return this.progs.get(key)!;
    let prog: Prog | null = null;
    try {
      const program = compileProgram(gl, vs, fs);
      const uniforms = new Map<string, UniformInfo>();
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(program, i)!;
        const loc = gl.getUniformLocation(program, info.name);
        if (loc)
          uniforms.set(info.name.replace(/\[0\]$/, ''), {loc, type: info.type, size: info.size});
      }
      prog = {program, uniforms};
    } catch (e) {
      this.lastError = `${key}: ${(e as Error).message}`;
      console.error(this.lastError);
    }
    this.progs.set(key, prog);
    return prog;
  }

  private use(prog: Prog, values: Uniforms) {
    const gl = this.gl!;
    gl.useProgram(prog.program);
    let unit = 0;
    prog.uniforms.forEach(({loc, type, size}, name) => {
      const v = values[name];
      if (type === gl.SAMPLER_2D) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, (v as WebGLTexture) ?? this.dummyTex);
        gl.uniform1i(loc, unit++);
        return;
      }
      if (v === undefined) return;
      const arr = v as ArrayLike<number>;
      switch (type) {
        case gl.FLOAT:
          if (size > 1) gl.uniform1fv(loc, arr as Float32Array);
          else gl.uniform1f(loc, v as number);
          break;
        case gl.FLOAT_VEC2:
          gl.uniform2fv(loc, arr as Float32Array);
          break;
        case gl.FLOAT_VEC3:
          gl.uniform3fv(loc, arr as Float32Array);
          break;
        case gl.FLOAT_VEC4:
          gl.uniform4fv(loc, arr as Float32Array);
          break;
        case gl.INT:
          gl.uniform1i(loc, v as number);
          break;
        case gl.FLOAT_MAT4:
          gl.uniformMatrix4fv(loc, false, arr as Float32Array);
          break;
      }
    });
  }

  private target(name: string, w: number, h: number, n: number, fmt: number): Target {
    const gl = this.gl!;
    const existing = this.targets.get(name);
    if (
      existing &&
      existing.w === w &&
      existing.h === h &&
      existing.tex.length === n &&
      existing.fmt === fmt
    ) {
      return existing;
    }
    if (existing) this.deleteTarget(existing);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    const tex: WebGLTexture[] = [];
    const filter =
      fmt === gl.RGBA16F || (fmt === gl.RGBA32F && this.fieldFmt === gl.RGBA32F)
        ? gl.LINEAR
        : gl.NEAREST;
    for (let i = 0; i < n; i++) {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
      tex.push(t);
    }
    gl.drawBuffers(tex.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    for (let i = 0; i < n; i++) gl.clearBufferfv(gl.COLOR, i, [0, 0, 0, 0]);
    const t: Target = {fbo, tex, w, h, fmt};
    this.targets.set(name, t);
    return t;
  }

  private deleteTarget(t: Target) {
    const gl = this.gl!;
    gl.deleteFramebuffer(t.fbo);
    t.tex.forEach(x => gl.deleteTexture(x));
  }

  /** Full-screen pass into a target (or the map framebuffer when null). */
  private pass(
    prog: Prog | null,
    target: Target | null,
    values: Uniforms,
    size?: [number, number]
  ) {
    const gl = this.gl!;
    if (!prog) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.fbo ?? null);
    const [w, h] = target ? [target.w, target.h] : size!;
    gl.viewport(0, 0, w, h);
    this.use(prog, values);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private blur(src: Target, tmp: Target, dst: Target, sigmaTexels: number) {
    const prog = this.prog('blur', FULLSCREEN_VERT, BLUR_FRAG);
    const gl = this.gl!;
    gl.disable(gl.BLEND);
    this.pass(prog, tmp, {
      u_src0: src.tex[0],
      u_src1: src.tex[1],
      u_dir: [1 / src.w, 0],
      u_sigma: sigmaTexels,
    });
    this.pass(prog, dst, {
      u_src0: tmp.tex[0],
      u_src1: tmp.tex[1],
      u_dir: [0, 1 / src.h],
      u_sigma: sigmaTexels,
    });
  }

  private setBlend(mode: LabMode['blend']) {
    const gl = this.gl!;
    if (mode === 'opaque') {
      gl.disable(gl.BLEND);
      return;
    }
    gl.enable(gl.BLEND);
    if (mode === 'multiply') gl.blendFunc(gl.DST_COLOR, gl.ZERO);
    else if (mode === 'add') gl.blendFunc(gl.ONE, gl.ONE);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  // ---------------------------------------------------------------- frame

  render(glCtx: WebGLRenderingContext | WebGL2RenderingContext, matrix: number[] | Float32Array) {
    const gl = glCtx as WebGL2RenderingContext;
    const map = this.map;
    const mode = this.mode;
    if (!map || !mode) return;
    try {
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      this.frame(gl, matrix, map, mode);
    } catch (e) {
      this.lastError = (e as Error).message;
      console.error('[dot-lab]', e);
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindVertexArray(null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    }
    if (mode.animate) map.triggerRepaint();
  }

  private frame(
    gl: WebGL2RenderingContext,
    matrix: ArrayLike<number>,
    map: MapLibreMap,
    mode: LabMode
  ) {
    const dbw = gl.drawingBufferWidth;
    const dbh = gl.drawingBufferHeight;
    const canvas = map.getCanvas();
    const cssW = canvas.clientWidth || dbw;
    const cssH = canvas.clientHeight || dbh;
    const dpr = dbw / cssW;
    const zoom = map.getZoom();
    const center = map.getCenter();
    const now = performance.now();
    const dt = this.lastT ? Math.min(0.1, (now - this.lastT) / 1000) : 1 / 60;
    this.lastT = now;
    const worldPx = 512 * 2 ** zoom;
    const mPerPx = (40075016.686 * Math.cos((center.lat * Math.PI) / 180)) / worldPx;
    // Baseline keeps production's people-per-dot; lab modes size dots so a
    // 6px cell at 5,000 people/km² holds one, giving every zoom the same tone
    const ppd =
      (mode.id === 'baseline'
        ? peoplePerDotForLevel(gridLevelForZoom(zoom))
        : Math.max(1, 2 ** Math.round(Math.log2(5000e-6 * (6 * mPerPx) ** 2)))) /
      this.densityFactor;
    this.onFrame?.({ppd, mPerPx, error: this.lastError || undefined});
    const p = this.params;
    const paramUniforms: Uniforms = {};
    for (const [k, v] of Object.entries(p)) paramUniforms[`u_${k}`] = v;

    if (mode.kind === 'polygon') {
      this.drawPolygons(gl, matrix, mode, zoom, ppd, dpr, paramUniforms);
      return;
    }

    const sigmas = (mode.fields?.(p) ?? []).slice(0, 4);
    const margin = Math.min(200, 3 * Math.max(0, ...sigmas)) + 8;
    const ds = this.fieldDs;
    const fw = Math.ceil((cssW + 2 * margin) / ds);
    const fh = Math.ceil((cssH + 2 * margin) / ds);
    const fx = [
      cssW / (cssW + 2 * margin),
      cssH / (cssH + 2 * margin),
      margin / (cssW + 2 * margin),
      margin / (cssH + 2 * margin),
    ];

    // Readback first: the map framebuffer holds the basemap (and mask layers) right now
    if (mode.readback) {
      if (!this.backTex || this.backTex.w !== dbw || this.backTex.h !== dbh) {
        if (this.backTex) gl.deleteTexture(this.backTex.tex);
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, dbw, dbh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.backTex = {tex, w: dbw, h: dbh};
      }
      gl.bindTexture(gl.TEXTURE_2D, this.backTex.tex);
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, dbw, dbh);
    }

    // 1. Raw (polygon-exact) field
    const fmt = this.fieldFmt;
    const R = this.target('R', fw, fh, 2, fmt);
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.fbo);
    gl.viewport(0, 0, fw, fh);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 0]);
    gl.disable(gl.BLEND);
    const fieldProg = this.prog('field', TILE_VERT, FIELD_FRAG);
    if (fieldProg) {
      for (const tile of this.tiles.values()) {
        this.use(fieldProg, {
          u_matrix: composeTileMatrix(matrix, tile.id),
          u_shrink: [fx[0], fx[1]],
          u_density: tile.texture,
          u_texWidth: DOT_DENSITY_TEXTURE_WIDTH,
          u_scale: FIELD_SCALE,
        });
        gl.bindVertexArray(tile.vao);
        gl.drawElements(gl.TRIANGLES, tile.indexCount, gl.UNSIGNED_INT, 0);
      }
    }

    // 2. Blur chain: each level blurs the previous by the incremental sigma
    const T = this.target('T', fw, fh, 2, fmt);
    const F: Target[] = [];
    let src = R;
    let prev = 0;
    sigmas.forEach((s, i) => {
      const inc = Math.sqrt(Math.max(0, s * s - prev * prev)) / ds;
      const dst = this.target(`F${i}`, fw, fh, 2, fmt);
      this.blur(src, T, dst, inc);
      src = dst;
      prev = Math.max(prev, s);
      F.push(dst);
    });

    const toPx = 2 ** (22 - 2 * zoom);
    const cx = lngToMercX(center.lng) * worldPx;
    const cy = latToMercY(center.lat) * worldPx;
    const M = 65536;
    const mod = (a: number) => ((a % M) + M) % M;
    const u: Uniforms = {
      ...paramUniforms,
      u_res: [dbw, dbh],
      u_css: [cssW, cssH],
      u_dpr: dpr,
      u_zoom: zoom,
      u_time: (now - this.t0) / 1000,
      u_pan: [mod(cx - cssW / 2), mod(-(cy + cssH / 2))],
      u_mouse: this.mouse,
      u_palette: this.palette,
      u_ncat: this.ncat,
      u_toPx: toPx,
      u_fx: fx,
      u_fres: [fw, fh],
      u_ds: ds,
      u_mPerPx: mPerPx,
      u_ppd: ppd,
      u_noise: this.noiseTex!,
      u_Ra: R.tex[0],
      u_Rb: R.tex[1],
    };
    F.forEach((t, i) => {
      u[`u_F${i}a`] = t.tex[0];
      u[`u_F${i}b`] = t.tex[1];
    });

    // 3. Mode-specific passes
    if (mode.readback && this.backTex) {
      const Mk = this.target('M', fw, fh, 2, fmt);
      const Mb = this.target('Mb', fw, fh, 2, fmt);
      this.pass(this.prog('mask', FULLSCREEN_VERT, MASK_FRAG), Mk, {
        u_back: this.backTex.tex,
        u_fx: fx,
      });
      this.blur(Mk, T, Mb, (p.reach ?? 8) / ds);
      u.u_Ma = Mk.tex[0];
      u.u_Mb = Mb.tex[0];
    }
    if (mode.sim === 'watershed' && F[0]) {
      const ptrFmt = this.fieldFmt === gl.RGBA32F ? gl.RGBA32F : gl.RGBA16F;
      let a = this.target('P0', fw, fh, 1, ptrFmt);
      let b = this.target('P1', fw, fh, 1, ptrFmt);
      const minField = ((p.min ?? 50) * mPerPx * mPerPx) / 1e6 / toPx;
      this.pass(this.prog('ws-init', FULLSCREEN_VERT, WATERSHED_INIT_FRAG), a, {
        u_tot: F[0].tex[1],
        u_min: minField,
      });
      const jump = this.prog('ws-jump', FULLSCREEN_VERT, WATERSHED_JUMP_FRAG);
      for (let i = 0; i < 11; i++) {
        this.pass(jump, b, {u_ptr: a.tex[0]});
        [a, b] = [b, a];
      }
      u.u_ptr = a.tex[0];
    }
    let ps: StepResult | null = null;
    if (mode.sim === 'langevin' || mode.sim === 'stars') {
      ps = this.stepParticles(gl, map, mode, u, dt, cssW, cssH, zoom);
      if (ps && mode.sim === 'stars') this.drawTrails(gl, ps, u, dt, dbw, dbh, cssW, cssH);
    }

    // 4. Composite into the map framebuffer
    const modeProg = this.prog(
      `mode:${mode.id}`,
      FULLSCREEN_VERT,
      PRELUDE + mode.params.map(x => `uniform float u_${x.key};\n`).join('') + mode.frag
    );
    this.setBlend(mode.blend ?? 'premult');
    this.pass(modeProg, null, u, [dbw, dbh]);

    if (ps && mode.sim === 'langevin') {
      const pp = this.prog('points', PARTICLE_VERT, PARTICLE_FRAG);
      if (pp) {
        this.setBlend('premult');
        this.use(pp, {
          u_state: ps.cur.tex[0],
          u_S: ps.S,
          u_a2s: ps.a2s,
          u_css: [cssW, cssH],
          u_dpr: dpr,
          u_size: p.size ?? 2,
          u_palette: this.palette,
        });
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.POINTS, 0, ps.S * ps.S);
      }
    }
  }

  private drawPolygons(
    gl: WebGL2RenderingContext,
    matrix: ArrayLike<number>,
    mode: LabMode,
    zoom: number,
    ppd: number,
    dpr: number,
    paramUniforms: Uniforms
  ) {
    const prog = this.prog(`mode:${mode.id}`, TILE_VERT, mode.frag);
    if (!prog) return;
    const n = gridLevelForZoom(zoom);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    this.setBlend('premult');
    for (const tile of this.tiles.values()) {
      const cellsPerTile = 2 ** (n - tile.id.z);
      this.use(prog, {
        ...paramUniforms,
        u_matrix: composeTileMatrix(matrix, tile.id),
        u_shrink: [1, 1],
        u_density: tile.texture,
        u_texWidth: DOT_DENSITY_TEXTURE_WIDTH,
        u_cellOrigin: [tile.id.x * cellsPerTile, tile.id.y * cellsPerTile],
        u_cellsPerTile: cellsPerTile,
        u_cellAreaWorld: 4 ** -n,
        u_peoplePerDot: ppd,
        u_dotRadius: DOT_DENSITY_DOT_RADIUS,
        u_opacity: 1,
        u_palette: this.palette,
        u_ncat: this.ncat,
        u_tileZ: tile.id.z,
        u_tileXY: [tile.id.x, tile.id.y],
        u_ppd: ppd,
        u_dpr: dpr,
      });
      gl.bindVertexArray(tile.vao);
      gl.drawElements(gl.TRIANGLES, tile.indexCount, gl.UNSIGNED_INT, 0);
    }
  }

  /**
   * Particle state lives in anchor-zoom CSS px relative to a fixed lng/lat,
   * so particles ride along with pans and zooms; screen = pos * a2s.xy + a2s.zw.
   */
  private stepParticles(
    gl: WebGL2RenderingContext,
    map: MapLibreMap,
    mode: LabMode,
    u: Uniforms,
    dt: number,
    cssW: number,
    cssH: number,
    zoom: number
  ): StepResult {
    const p = this.params;
    const S = Math.max(16, Math.round(Math.sqrt((p.count ?? 64) * 1000)));
    let ps = this.particles;
    const anchorScreen = ps ? map.project([ps.anchor.lng, ps.anchor.lat]) : null;
    const farAnchor =
      !ps ||
      Math.abs(zoom - ps.anchor.z) > 4 ||
      !anchorScreen ||
      Math.abs(anchorScreen.x) > 1e5 ||
      Math.abs(anchorScreen.y) > 1e5;
    if (!ps || ps.S !== S || farAnchor) {
      const c = map.getCenter();
      ps = {
        S,
        state: [this.target('S0', S, S, 2, gl.RGBA32F), this.target('S1', S, S, 2, gl.RGBA32F)],
        anchor: {lng: c.lng, lat: c.lat, z: zoom},
        frame: 0,
        reset: true,
        lastA2s: null,
        trailFlip: false,
      };
      this.particles = ps;
    }
    const a = map.project([ps.anchor.lng, ps.anchor.lat]);
    const k = 2 ** (zoom - ps.anchor.z);
    const a2s = [k, -k, a.x, cssH - a.y];
    const [old, next] = ps.state;
    const rule = mode.sim === 'langevin' ? 0 : (p.rule ?? 1);
    const prog = this.prog(
      'particles-update',
      FULLSCREEN_VERT,
      PRELUDE.replace(
        'out vec4 fragColor;',
        'layout(location = 0) out vec4 fragColor;\nlayout(location = 1) out vec4 fragColor2;'
      ) + PARTICLE_UPDATE_BODY
    );
    gl.disable(gl.BLEND);
    this.pass(prog, next, {
      ...u,
      u_s0: old.tex[0],
      u_s1: old.tex[1],
      u_a2s: a2s,
      u_dt: dt,
      u_D: p.temp ?? 0,
      u_life: p.life ?? 2,
      u_frame: ps.frame++,
      u_reset: ps.reset ? 1 : 0,
      u_rule: rule,
      u_speed: p.speed ?? 0,
      u_dir: p.dir ?? 0,
      u_spread: p.spread ?? 0,
    });
    const wasReset = ps.reset;
    ps.reset = false;
    ps.state = [next, old];
    const lastA2s = wasReset ? null : ps.lastA2s;
    ps.lastA2s = a2s;
    return {a2s, S, cur: next, old, lastA2s};
  }

  private drawTrails(
    gl: WebGL2RenderingContext,
    ps: StepResult,
    u: Uniforms,
    dt: number,
    dbw: number,
    dbh: number,
    cssW: number,
    cssH: number
  ) {
    const parts = this.particles!;
    const A = this.target('trailA', dbw, dbh, 1, gl.RGBA16F);
    const B = this.target('trailB', dbw, dbh, 1, gl.RGBA16F);
    const [prevT, curT] = parts.trailFlip ? [B, A] : [A, B];
    parts.trailFlip = !parts.trailFlip;
    const last = ps.lastA2s;
    const sc = ps.a2s;
    // current screen px → last frame's screen px (via the shared anchor coords)
    const c2p = last
      ? [
          last[0] / sc[0],
          last[1] / sc[1],
          last[2] - (sc[2] * last[0]) / sc[0],
          last[3] - (sc[3] * last[1]) / sc[1],
        ]
      : [1, 1, 0, 0];
    gl.disable(gl.BLEND);
    this.pass(this.prog('trail', FULLSCREEN_VERT, TRAIL_FRAG), curT, {
      u_prev: prevT.tex[0],
      u_c2p: c2p,
      u_css: [cssW, cssH],
      u_decay: last ? Math.exp(-dt / Math.max(0.01, this.params.trail ?? 0.3)) : 0,
    });
    const streak = this.prog('streak', STREAK_VERT, STREAK_FRAG);
    if (streak) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, curT.fbo);
      gl.viewport(0, 0, dbw, dbh);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      this.use(streak, {
        u_old: ps.old.tex[0],
        u_new: ps.cur.tex[0],
        u_new1: ps.cur.tex[1],
        u_S: ps.S,
        u_a2s: ps.a2s,
        u_css: [cssW, cssH],
        u_width: this.params.width ?? 1.5,
        u_bright: this.params.bright ?? 0.2,
        u_palette: this.palette,
      });
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES, 0, ps.S * ps.S * 6);
    }
    u.u_trailTex = curT.tex[0];
  }
}
