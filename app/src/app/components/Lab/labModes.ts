import {DOT_DENSITY_FRAG} from '@components/Map/CustomLayers/shaders';

/**
 * The lab's renderers. Each mode is one fragment shader:
 * - kind 'field': full-screen composite over the population field. The body
 *   is appended to PRELUDE (labGlsl.ts) plus one `uniform float u_<key>;`
 *   per param. `fields` lists the blur sigmas (CSS px, ascending) it reads
 *   as u_F0..u_F3; u_Ra/u_Rb is the unblurred, polygon-exact field.
 * - kind 'polygon': draws tile triangles directly (complete shader).
 */
export type LabParam = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
};

export type LabMode = {
  id: string;
  name: string;
  family: string;
  idea: string;
  kind: 'field' | 'polygon';
  frag: string;
  params: LabParam[];
  fields?: (p: Record<string, number>) => number[];
  blend?: 'premult' | 'multiply' | 'add' | 'opaque';
  basemap?: 'light' | 'dark' | 'none' | 'blank';
  animate?: boolean;
  sim?: 'langevin' | 'stars' | 'watershed';
  readback?: boolean;
  legend?: (p: Record<string, number>, ppd: number) => string;
  quadLabels?: (p: Record<string, number>, mPerPx: number) => string[];
};

const P = (
  key: string,
  label: string,
  min: number,
  max: number,
  step: number,
  value: number
): LabParam => ({key, label, min, max, step, value});

const fmtPeople = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${Math.round(n * 10) / 10}`;
const fmtMeters = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

// Ref density sliders are people/km²
const REF = (value = 3000) => P('ref', 'Full ink at (people/km²)', 250, 20000, 250, value);

export const LAB_MODES: LabMode[] = [
  {
    id: 'baseline',
    name: 'Baseline: production stipple',
    family: 'Reference',
    idea: 'The current districtr shader (polygon-exact, white-noise hashed dots). Here for comparison.',
    kind: 'polygon',
    frag: DOT_DENSITY_FRAG,
    params: [],
    legend: (_, ppd) => `1 dot ≈ ${fmtPeople(ppd)} people`,
  },

  // ---------------------------------------------------------------- print
  {
    id: 'halftone',
    name: '1. Overprinted halftone screens',
    family: 'Print',
    idea: 'Each group is an ink with its own rotated AM screen (15°, 75°, 0°, 45°…), dot area = local density. Inks multiply like press overprint: homogeneous areas show one clean screen, mixed areas form rosettes and darker blended tones. Micro reading: the screens; macro reading: the optical color.',
    kind: 'field',
    params: [
      P('cell', 'Screen cell (px)', 4, 24, 0.5, 8),
      REF(7000),
      P('ink', 'Ink strength', 0.2, 1, 0.05, 0.9),
    ],
    fields: p => [p.cell * 0.5],
    blend: 'multiply',
    frag: `
const float ANG[6] = float[6](0.2618, 1.3090, 0.0, 0.7854, 0.5236, 1.0472);
void main() {
  vec2 P = patPx();
  vec3 col = vec3(1.0);
  float aa = 0.6 / u_dpr;
  for (int k = 0; k < 6; k++) {
    if (k >= u_ncat) break;
    mat2 R = rot(ANG[k]);
    mat2 Ri = rot(-ANG[k]);
    vec2 q = R * P / u_cell;
    vec2 base = floor(q);
    float cov = 0.0;
    // 3x3: dark tones grow dots past their cell
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        vec2 cc = base + vec2(float(dx), float(dy)) + 0.5;
        Pop p = popAt(u_F0a, u_F0b, patUv(Ri * (cc * u_cell)));
        float r = sqrt(tone(p.c[k], u_ref) / PI) * u_cell * 1.15;
        float d = length(q - cc) * u_cell;
        cov = max(cov, 1.0 - smoothstep(r - aa, r + aa, d));
      }
    }
    col *= mix(vec3(1.0), u_palette[k], cov * u_ink);
  }
  fragColor = vec4(col, 1.0);
}`,
  },
  {
    id: 'pointillism',
    name: '2. Blue-noise pointillism',
    family: 'Print',
    idea: 'FM screening instead of hashed dots: a void-and-cluster threshold per cell gives minimum-distance stippling (no clumps, no visible grid), and a second blue-noise rank assigns colors so groups interleave evenly. Seurat-style optical mixing; reads like an engraving.',
    kind: 'field',
    params: [
      P('dot', 'Dot cell (px)', 2, 10, 0.5, 3.5),
      P('size', 'Dot radius (× cell)', 0.2, 1, 0.05, 0.42),
      P('smooth', 'Smoothing (px)', 0, 12, 0.5, 0),
    ],
    fields: p => [p.smooth],
    frag: `
void main() {
  fragColor = stipple(patPx(), u_dot, u_size, u_F0a, u_F0b);
}`,
    legend: (_, ppd) => `1 dot ≈ ${fmtPeople(ppd)} people`,
  },
  {
    id: 'hatching',
    name: '3. Copperplate hatching',
    family: 'Print',
    idea: "Bertin's orientation variable: each group is a hatch direction; line weight swells continuously with that group's density. Mixed places cross-hatch. In mono mode composition is carried by texture alone, so it survives grayscale printing and color blindness.",
    kind: 'field',
    params: [
      P('sp', 'Line spacing (px)', 3, 14, 0.5, 6),
      REF(8000),
      P('mono', 'Monochrome', 0, 1, 1, 0),
      P('wobble', 'Hand wobble', 0, 1, 0.05, 0.25),
    ],
    fields: p => [p.sp * 0.8],
    blend: 'multiply',
    frag: `
const float HANG[6] = float[6](0.0, 1.5708, 0.7854, 2.3562, 0.3927, 1.9635);
void main() {
  vec2 P = patPx();
  Pop p = popAt(u_F0a, u_F0b, v_uv);
  vec3 col = vec3(1.0);
  float wob = u_wobble * (vnoise(P * 0.035) - 0.5) * 1.5;
  float aa = 0.5 / u_dpr;
  for (int k = 0; k < 6; k++) {
    if (k >= u_ncat) break;
    vec2 n = vec2(cos(HANG[k]), sin(HANG[k]));
    float d = abs(fract(dot(P, n) / u_sp + wob) - 0.5) * u_sp;
    float tn = tone(p.c[k], u_ref);
    float hw = 0.5 * u_sp * tn;
    float cov = (1.0 - smoothstep(hw - aa, hw + aa, d)) * step(0.03, tn);
    vec3 ink = u_mono > 0.5 ? INK : u_palette[k] * 0.85;
    col *= mix(vec3(1.0), ink, cov);
  }
  fragColor = vec4(col, 1.0);
}`,
  },

  // ---------------------------------------------------------------- terrain
  {
    id: 'relief',
    name: '4. Population relief',
    family: 'Terrain',
    idea: 'Log-density as elevation, shaded like Imhof/Swiss relief (key light + soft fill + ambient occlusion from a wider blur). Cities rise as massifs; tint is the OKLab mix of who lives there, fading to paper in the lowlands.',
    kind: 'field',
    params: [
      P('smooth', 'Smoothing (px)', 1, 30, 0.5, 12),
      P('exag', 'Vertical exaggeration', 1, 60, 1, 8),
      P('az', 'Light azimuth (°)', 0, 360, 5, 135),
      P('tint', 'Tint', 0, 1, 0.05, 0.8),
      P('ao', 'Occlusion', 0, 3, 0.1, 1),
    ],
    fields: p => [p.smooth, p.smooth * 4],
    blend: 'opaque',
    frag: `
float hgt(sampler2D b, vec2 uv) { return log2(1.0 + km2(totalAt(b, uv)) / 30.0); }
void main() {
  vec2 e = vec2(u_ds) / u_css;
  float hL = hgt(u_F0b, v_uv - vec2(e.x, 0.0)), hR = hgt(u_F0b, v_uv + vec2(e.x, 0.0));
  float hD = hgt(u_F0b, v_uv - vec2(0.0, e.y)), hU = hgt(u_F0b, v_uv + vec2(0.0, e.y));
  vec2 g = vec2(hR - hL, hU - hD) / (2.0 * u_ds) * u_exag;
  vec3 n = normalize(vec3(-g, 1.0));
  float az = radians(u_az);
  vec3 L = normalize(vec3(cos(az), sin(az), 1.0));
  vec3 L2 = normalize(vec3(cos(az + 1.6), sin(az + 1.6), 2.0));
  float key = max(dot(n, L), 0.0) / L.z;
  float fill = max(dot(n, L2), 0.0) / L2.z;
  float shade = mix(key, fill, 0.3);
  float h = hgt(u_F0b, v_uv);
  float occl = clamp(1.0 - max(hgt(u_F1b, v_uv) - h, 0.0) * 0.12 * u_ao, 0.55, 1.0);
  Pop p = popAt(u_F0a, u_F0b, v_uv);
  vec3 tint = mix(PAPER, popColor(p), clamp(h / 9.0, 0.0, 1.0) * u_tint);
  fragColor = vec4(tint * (0.3 + 0.72 * clamp(shade, 0.0, 1.5)) * occl, 1.0);
}`,
  },
  {
    id: 'tanaka',
    name: '5. Tanaka illuminated contours',
    family: 'Terrain',
    idea: "Kitiro Tanaka's 1950 method on density isolines (one per doubling): lines facing the light are white, lines facing away are black, width follows the angle. A flat map gains a stepped, embossed 3D reading with very little ink.",
    kind: 'field',
    params: [
      P('smooth', 'Smoothing (px)', 1, 30, 0.5, 6),
      P('per', 'Lines per doubling', 0.5, 3, 0.25, 1),
      P('base', 'Lowest line (people/km²)', 10, 2000, 10, 60),
      P('width', 'Line width (px)', 0.5, 4, 0.25, 1.75),
      P('color', 'Composition fill', 0, 1, 1, 1),
    ],
    fields: p => [p.smooth],
    blend: 'opaque',
    frag: `
float lev(vec2 uv) { return log2(1.0 + km2(totalAt(u_F0b, uv)) / u_base) * u_per; }
void main() {
  float L = lev(v_uv);
  vec2 e = vec2(u_ds) / u_css;
  vec2 g = vec2(lev(v_uv + vec2(e.x, 0.0)) - lev(v_uv - vec2(e.x, 0.0)),
                lev(v_uv + vec2(0.0, e.y)) - lev(v_uv - vec2(0.0, e.y))) / (2.0 * u_ds);
  float gl = length(g);
  float f = fract(L);
  float distPx = min(f, 1.0 - f) / max(gl, 1e-6);
  float band = floor(L);
  vec2 down = gl > 1e-7 ? -g / gl : vec2(0.0);
  float lit = dot(down, normalize(vec2(-1.0, 1.0)));
  float w = u_width * (0.4 + 0.6 * abs(lit));
  float aa = 0.5 / u_dpr;
  float line = (1.0 - smoothstep(w * 0.5 - aa, w * 0.5 + aa, distPx)) * step(0.6, L);
  float bt = clamp(band / (9.0 * u_per), 0.0, 1.0);
  Pop p = popAt(u_F0a, u_F0b, v_uv);
  vec3 gray = mix(vec3(0.80), vec3(0.45), bt);
  vec3 hue = mix(PAPER, popColor(p), 0.15 + 0.75 * bt) * (1.0 - 0.2 * bt);
  vec3 base = band < 1.0 ? PAPER : (u_color > 0.5 ? hue : gray);
  vec3 lineCol = lit > 0.0 ? vec3(1.0) : vec3(0.04);
  fragColor = vec4(mix(base, lineCol, line * clamp(abs(lit) * 1.6, 0.3, 1.0)), 1.0);
}`,
  },
  {
    id: 'ridgelines',
    name: '6. Unknown Pleasures ridgelines',
    family: 'Terrain',
    idea: 'Joy Division / Alasdair Rae population lines: horizontal profiles lifted by density, each hiding the ones behind it. In stacked mode the area under every profile is a stacked composition chart, so each line is simultaneously a density transect and a cross-section of who lives along it.',
    kind: 'field',
    params: [
      P('gap', 'Line spacing (px)', 4, 30, 1, 10),
      P('height', 'Peak height (px)', 10, 240, 5, 80),
      REF(6000),
      P('lw', 'Line width (px)', 0.5, 3, 0.25, 1.25),
      P('style', 'Stacked composition', 0, 1, 1, 0),
    ],
    fields: p => [Math.max(1, p.gap * 0.6)],
    blend: 'opaque',
    frag: `
float ridgeH(float x, float yb, out Pop p) {
  p = popAt(u_F0a, u_F0b, patUv(vec2(x, yb)));
  return u_height * pow(tone(p.t, u_ref), 0.85);
}
void main() {
  vec2 P = patPx();
  float j0 = floor(P.y / u_gap);
  int K = int(ceil(u_height / u_gap)) + 1;
  bool stacked = u_style > 0.5;
  vec3 col = stacked ? PAPER : vec3(0.015);
  float aa = 0.45 / u_dpr;
  // Back (just below the pixel) to front; the frontmost covering profile wins
  for (int i = 0; i < 64; i++) {
    if (i > K) break;
    float yb = (j0 - float(i)) * u_gap;
    Pop p;
    float h = ridgeH(P.x, yb, p);
    float y = P.y - yb;
    if (y > h + u_lw) continue;
    Pop q;
    float slope = (ridgeH(P.x + 1.0, yb, q) - ridgeH(P.x - 1.0, yb, q)) * 0.5;
    float dist = abs(y - h) / sqrt(1.0 + slope * slope);
    float stroke = 1.0 - smoothstep(u_lw * 0.5 - aa, u_lw * 0.5 + aa, dist);
    vec3 fill = stacked
      ? mix(PAPER, u_palette[pickCat(p, clamp(y / max(h, 1e-3), 0.0, 0.999))], h > 1.0 ? 0.85 : 0.0)
      : vec3(0.015);
    col = mix(fill, stacked ? INK : vec3(0.93), stroke);
  }
  fragColor = vec4(col, 1.0);
}`,
  },
  {
    id: 'spikes',
    name: '7. Stacked spike field',
    family: 'Terrain',
    idea: 'A staggered grid of needles, height ∝ local population, segmented bottom-to-top by group like a stacked bar, lit on one flank. Spike maps read magnitude by length (more accurate than area or color) and the segments add composition without a legend lookup.',
    kind: 'field',
    params: [
      P('sp', 'Spacing (px)', 6, 40, 1, 20),
      P('height', 'Height at ref (px)', 10, 260, 5, 90),
      P('ref', 'Ref density (people/km²)', 1000, 40000, 500, 20000),
      P('wid', 'Base width', 0.2, 1, 0.05, 0.6),
    ],
    fields: p => [p.sp * 0.5],
    frag: `
void main() {
  vec2 P = patPx();
  float R = u_sp * 0.5;
  float j0 = floor(P.y / R);
  int K = int(ceil(1.6 * u_height / R)) + 1;
  vec4 col = vec4(0.0);
  float aa = 0.5 / u_dpr;
  for (int i = 0; i < 96; i++) {
    if (i > K) break;
    float j = j0 - float(i);
    float yb = j * R;
    float off = mod(j, 2.0) * 0.5 * u_sp;
    float ci = floor((P.x - off) / u_sp + 0.5);
    float y = P.y - yb;
    for (int dx = -1; dx <= 1; dx++) {
      float xc = (ci + float(dx)) * u_sp + off;
      Pop p = popAt(u_F0a, u_F0b, patUv(vec2(xc, yb)));
      float h = u_height * min(km2(p.t) / u_ref, 1.6);
      if (h < 0.75 || y > h) continue;
      float hw = u_sp * u_wid * 0.5 * (1.0 - y / h);
      float dxp = P.x - xc;
      float a = 1.0 - smoothstep(hw - aa, hw + aa, abs(dxp));
      if (a <= 0.0) continue;
      vec3 c = u_palette[pickCat(p, clamp(y / h, 0.0, 0.999))] * (dxp < 0.0 ? 1.0 : 0.62);
      c = mix(c, INK, smoothstep(hw - 1.2, hw, abs(dxp)) * 0.6);
      col = vec4(c * a, a) + col * (1.0 - a);
    }
  }
  fragColor = col;
}`,
  },

  // ---------------------------------------------------------------- counting
  {
    id: 'waffle',
    name: '8. Isotype waffle grid',
    family: 'Counting',
    idea: "Otto Neurath's Isotype: each grid cell is a tiny waffle where every filled unit is the same number of people, sorted by group. You can count. Empty capacity is a faint tick, so the grid itself stays nearly invisible (Tufte's data-ink).",
    kind: 'field',
    params: [
      P('cell', 'Cell (px)', 14, 80, 1, 30),
      P('grid', 'Units per side', 2, 10, 1, 5),
      P('mult', 'People per unit (× dot)', 0.25, 64, 0.25, 4),
      P('glyph', 'Person glyphs', 0, 1, 1, 0),
    ],
    fields: p => [p.cell * 0.45],
    frag: `
float sdPerson(vec2 q) {
  float head = length(q - vec2(0.5, 0.79)) - 0.14;
  vec2 b = q - vec2(0.5, 0.33);
  vec2 d = abs(b) - vec2(0.22, 0.27);
  float body = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 0.05;
  return min(head, body);
}
void main() {
  vec2 P = patPx();
  vec2 cell = floor(P / u_cell);
  vec2 lp = (P - cell * u_cell) / u_cell;
  Pop p = popAt(u_F0a, u_F0b, patUv((cell + 0.5) * u_cell));
  float units = p.t * u_cell * u_cell / (u_ppd * u_mult);
  int n = int(u_grid);
  float m = 0.07;
  vec2 q = (lp - m) / (1.0 - 2.0 * m);
  if (units < 0.02 || q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) { fragColor = vec4(0.0); return; }
  vec2 gq = q * float(n);
  ivec2 ui = ivec2(floor(gq));
  vec2 uq = fract(gq);
  int idx = (n - 1 - ui.y) * n + ui.x;
  float cap = float(n * n);
  // stochastic rounding keeps the totals unbiased
  float nFill = floor(units + hash4(ivec2(cell)).x);
  bool over = nFill > cap;
  nFill = min(nFill, cap);
  float aa = 1.2 / (u_cell / float(n) * u_dpr);
  vec4 col;
  if (float(idx) < nFill) {
    int k = pickCat(p, (float(idx) + 0.5) / nFill);
    float sd = u_glyph > 0.5 ? sdPerson(uq) : max(abs(uq.x - 0.5), abs(uq.y - 0.5)) - 0.38;
    float a = 1.0 - smoothstep(-aa, aa, sd);
    col = vec4(u_palette[k] * a, a);
  } else {
    float a = (1.0 - smoothstep(-aa, aa, length(uq - 0.5) - 0.07)) * 0.35;
    col = vec4(vec3(0.45) * a, a);
  }
  if (over) {
    float e = min(min(lp.x, lp.y), min(1.0 - lp.x, 1.0 - lp.y)) * u_cell;
    float a = 1.0 - smoothstep(0.8, 1.6, e);
    col = vec4(INK * a, a) + col * (1.0 - a);
  }
  fragColor = col;
}`,
    legend: (p, ppd) => `1 unit = ${fmtPeople(ppd * p.mult)} people · outlined cells overflow`,
  },
  {
    id: 'sunflower',
    name: '9. Phyllotaxis sunflowers',
    family: 'Counting',
    idea: 'Each cell grows a Vogel spiral (golden-angle seeds), one seed per N people. The flower’s area is the population (a proportional symbol that is also countable) and seeds are ordered by group, so composition reads as rings: majority at the core, minorities on the rim.',
    kind: 'field',
    params: [
      P('cell', 'Cell (px)', 20, 120, 2, 44),
      P('maxDots', 'Max seeds', 20, 600, 10, 180),
      P('mult', 'People per seed (× dot)', 0.25, 16, 0.25, 1),
      P('sortMaj', 'Majority at core', 0, 1, 1, 1),
    ],
    fields: p => [p.cell * 0.4],
    frag: `
void main() {
  vec2 P = patPx();
  vec2 cell = floor(P / u_cell);
  vec2 ctr = (cell + 0.5) * u_cell;
  Pop p = popAt(u_F0a, u_F0b, patUv(ctr));
  float n = min(floor(p.t * u_cell * u_cell / (u_ppd * u_mult) + hash4(ivec2(cell)).x), u_maxDots);
  if (n < 1.0) { fragColor = vec4(0.0); return; }
  float c = 0.47 * u_cell / sqrt(u_maxDots);
  float rad = 0.6 * c;
  vec2 d = P - ctr;
  float r = length(d);
  float k0 = max(0.0, floor((r - rad) * (r - rad) / (c * c) - 1.0));
  float k1 = min(n - 1.0, ceil((r + rad) * (r + rad) / (c * c)));
  float best = 1e9;
  float bestK = -1.0;
  for (int i = 0; i < 128; i++) {
    float k = k0 + float(i);
    if (k > k1) break;
    float th = k * 2.39996323;
    float dd = length(d - c * sqrt(k + 0.5) * vec2(cos(th), sin(th)));
    if (dd < best) { best = dd; bestK = k; }
  }
  if (bestK < 0.0) { fragColor = vec4(0.0); return; }
  float a = 1.0 - smoothstep(rad - 0.6 / u_dpr, rad + 0.6 / u_dpr, best);
  int ord[6] = int[6](0, 1, 2, 3, 4, 5);
  if (u_sortMaj > 0.5) {
    for (int s = 0; s < 6; s++) {
      for (int b = 0; b < 5; b++) {
        if (p.c[ord[b]] < p.c[ord[b + 1]]) { int t = ord[b]; ord[b] = ord[b + 1]; ord[b + 1] = t; }
      }
    }
  }
  float x = (bestK + 0.5) / n * p.t;
  float acc = 0.0;
  int cat = ord[0];
  for (int i = 0; i < 6; i++) {
    if (p.c[ord[i]] <= 0.0) continue;
    acc += p.c[ord[i]];
    cat = ord[i];
    if (x < acc) break;
  }
  fragColor = vec4(u_palette[cat] * a, a);
}`,
    legend: (p, ppd) => `1 seed = ${fmtPeople(ppd * p.mult)} people`,
  },
  {
    id: 'mosaic',
    name: '10. Equal-population mosaic',
    family: 'Counting',
    idea: 'Voronoi tesserae whose size adapts so each tile holds about N people (a world-stable quadtree level chosen per polygon, then thinned). Dense neighborhoods shatter into fine tiles and rural land into a few big ones: a density-equalizing texture, like a cartogram that never moves the map.',
    kind: 'polygon',
    params: [
      P('mult', 'People per tile (× dot)', 1, 256, 1, 16),
      P('grout', 'Grout (px)', 0, 3, 0.25, 0.75),
    ],
    legend: (p, ppd) => `1 tile ≈ ${fmtPeople(ppd * p.mult)} people`,
    frag: `#version 300 es
precision highp float;
precision highp int;
in vec2 v_local;
flat in int v_fidx;
uniform sampler2D u_density;
uniform int u_texWidth;
uniform float u_tileZ;
uniform vec2 u_tileXY;
uniform float u_ppd;
uniform float u_mult;
uniform float u_grout;
uniform float u_dpr;
uniform vec3 u_palette[6];
uniform int u_ncat;
out vec4 fragColor;
vec4 texelAt(int i) { return texelFetch(u_density, ivec2(i % u_texWidth, i / u_texWidth), 0); }
uvec2 pcg2d(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u; v ^= v >> 16u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u; v ^= v >> 16u;
  return v;
}
vec4 h4(vec2 c) {
  uvec2 s = pcg2d(uvec2(ivec2(c)));
  uvec2 t = pcg2d(s ^ uvec2(0x9E3779B9u));
  return vec4(float(s.x & 0xffffu), float(s.x >> 16u), float(t.x & 0xffffu), float(t.x >> 16u)) / 65536.0;
}
void main() {
  if (v_local.x < 0.0 || v_local.x >= 1.0 || v_local.y < 0.0 || v_local.y >= 1.0) discard;
  vec4 A = texelAt(2 * v_fidx);
  vec4 B = texelAt(2 * v_fidx + 1);
  float D = B.z;
  float N = u_ppd * u_mult;
  if (D <= 0.0) discard;
  // world cell area 4^-n ≈ N / D; ceil → tiles hold ≤ N, thinned to exactly N in expectation
  float n = clamp(ceil(0.5 * log2(D / N)), 0.0, 23.0);
  float cpt = exp2(n - u_tileZ);
  vec2 g = cpt >= 1.0 ? v_local * cpt : (u_tileXY + v_local) * cpt;
  vec2 org = cpt >= 1.0 ? u_tileXY * cpt : vec2(0.0);
  vec2 gi = floor(g), gf = fract(g);
  float md = 8.0;
  vec2 mr = vec2(0.0), mc = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 r = o + 0.12 + 0.76 * h4(org + gi + o).xy - gf;
      float d = dot(r, r);
      if (d < md) { md = d; mr = r; mc = gi + o; }
    }
  }
  float bd = 8.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 o = mc - gi + vec2(float(i), float(j));
      vec2 r = o + 0.12 + 0.76 * h4(org + gi + o).xy - gf;
      if (dot(mr - r, mr - r) > 1e-6) bd = min(bd, dot(0.5 * (mr + r), normalize(r - mr)));
    }
  }
  vec4 hh = h4(org + mc + 7919.0);
  if (hh.z >= D * exp2(-2.0 * n) / N) discard;
  float cats[6] = float[6](A.x, A.y, A.z, A.w, B.x, B.y);
  float x = hh.w * D;
  float acc = 0.0;
  int k = 0;
  for (int i = 0; i < 6; i++) {
    if (i >= u_ncat) break;
    if (cats[i] <= 0.0) continue;
    acc += cats[i];
    k = i;
    if (x < acc) break;
  }
  float cellPx = 1.0 / max(length(vec2(dFdx(g.x), dFdy(g.x))), 1e-6) / u_dpr;
  float bpx = bd * cellPx;
  float a = smoothstep(u_grout, u_grout + 1.0, bpx);
  float bevel = 0.82 + 0.25 * smoothstep(0.0, 5.0, bpx) - 0.1 * hh.x;
  vec3 col = u_palette[k] * bevel;
  fragColor = vec4(col * a, a);
}`,
  },

  // ---------------------------------------------------------------- textile
  {
    id: 'weave',
    name: '11. Woven tweed',
    family: 'Texture',
    idea: 'Warp and weft threads; each yarn segment is dyed by sampling local composition, thread thickness follows density. Homogeneous places weave a solid cloth, mixed places a tweed; sparse places loosen into an open weave you can see the map through. Texture as data.',
    kind: 'field',
    params: [
      P('pitch', 'Thread pitch (px)', 3, 16, 0.5, 6),
      REF(2500),
      P('twill', 'Twill weave', 0, 1, 1, 1),
      P('run', 'Yarn run (crossings)', 1, 8, 1, 3),
    ],
    fields: p => [p.pitch],
    frag: `
void main() {
  vec2 P = patPx();
  vec2 g = P / u_pitch;
  ivec2 ij = ivec2(floor(g));
  vec2 f = fract(g);
  Pop p = popAt(u_F0a, u_F0b, patUv((vec2(ij) + 0.5) * u_pitch));
  float tn = tone(p.t, u_ref);
  if (tn < 0.02) { fragColor = vec4(0.0); return; }
  float w = mix(0.18, 0.96, tn);
  float dWarp = abs(f.x - 0.5) / (0.5 * w);
  float dWeft = abs(f.y - 0.5) / (0.5 * w);
  bool inWarp = dWarp < 1.0;
  bool inWeft = dWeft < 1.0;
  if (!inWarp && !inWeft) { fragColor = vec4(0.0); return; }
  int phase = u_twill > 0.5 ? ((ij.x + ij.y) & 3) : (((ij.x + ij.y) & 1) * 2);
  bool showWarp = inWarp && (!inWeft || phase < 2);
  ivec2 runC = ivec2(floor(vec2(ij) / u_run));
  float dd, shade;
  int k;
  if (showWarp) {
    k = pickCat(p, hash4(ivec2(ij.x, runC.y)).x);
    dd = dWarp;
    shade = 0.75 + 0.25 * cos(PI * (f.y - 0.5));
  } else {
    k = pickCat(p, hash4(ivec2(runC.x + 7919, ij.y)).y);
    dd = dWeft;
    shade = 0.75 + 0.25 * cos(PI * (f.x - 0.5));
  }
  shade *= sqrt(max(1.0 - dd * dd, 0.0));
  float a = 1.0 - smoothstep(1.0 - 1.2 / (u_pitch * w * u_dpr), 1.0, dd);
  vec3 col = u_palette[k] * (0.45 + 0.7 * shade);
  fragColor = vec4(col * a, a);
}`,
  },
  {
    id: 'lic',
    name: '12. Flowing brushstrokes (LIC)',
    family: 'Texture',
    idea: 'Line integral convolution smears blue noise along density contours (or along iso-share lines of one group), with a moving kernel so the strokes flow. Van Gogh meets streamlines: you see the grain of settlement, where neighborhoods wrap around centers and where one group’s share shears.',
    kind: 'field',
    params: [
      P('smooth', 'Smoothing (px)', 2, 30, 0.5, 6),
      P('len', 'Stroke length (px)', 4, 32, 1, 16),
      P('mode', 'Follow group share', 0, 1, 1, 0),
      P('group', 'Group index', 0, 5, 1, 1),
      P('speed', 'Flow speed', 0, 1, 0.05, 0.3),
      REF(2000),
    ],
    fields: p => [p.smooth],
    animate: true,
    frag: `
float sval(vec2 uv) {
  if (u_mode < 0.5) return log(1.0 + km2(totalAt(u_F0b, uv)) / 20.0);
  return share(popAt(u_F0a, u_F0b, uv), int(u_group));
}
vec2 vf(vec2 px) {
  vec2 uv = px / u_css;
  vec2 e = vec2(u_ds) / u_css;
  vec2 g = vec2(sval(uv + vec2(e.x, 0.0)) - sval(uv - vec2(e.x, 0.0)),
                sval(uv + vec2(0.0, e.y)) - sval(uv - vec2(0.0, e.y)));
  float l = length(g);
  return l > 1e-9 ? vec2(-g.y, g.x) / l : vec2(0.7071);
}
void main() {
  vec2 x0 = fragPx();
  float acc = 0.0, wsum = 0.0;
  for (int dir = 0; dir < 2; dir++) {
    float sgn = dir == 0 ? 1.0 : -1.0;
    vec2 x = x0;
    for (int i = 0; i < 32; i++) {
      if (float(i) >= u_len) break;
      float s = sgn * float(i);
      float w = (0.55 + 0.45 * cos(2.0 * PI * (s / u_len - u_time * u_speed))) * (1.0 - abs(s) / u_len);
      acc += w * bnSmooth((x + u_pan) * 0.7);
      wsum += w;
      x += sgn * vf(x);
    }
  }
  float I = clamp((acc / max(wsum, 1e-4) - 0.5) * 3.2 + 0.5, 0.0, 1.0);
  Pop p = popAt(u_F0a, u_F0b, v_uv);
  vec3 base = popColor(p);
  vec3 col = mix(base * 0.35, mix(base, vec3(1.0), 0.4), I);
  float a = tone(p.t, u_ref);
  fragColor = vec4(col * a, a);
}`,
  },

  // ---------------------------------------------------------------- surfaces
  {
    id: 'oklab',
    name: '13. Perceptual mix, value-by-alpha',
    family: 'Surface',
    idea: 'The continuous field a dot map approximates optically, computed exactly: OKLab-mean of group colors (mixed places desaturate honestly), opacity by density (Roth/Woodruff value-by-alpha) so empty land vanishes. Smoothing at 0 is polygon-exact; drag it up for a KDE surface.',
    kind: 'field',
    params: [
      P('smooth', 'Smoothing (px)', 0, 40, 0.5, 3),
      REF(2500),
      P('gamma', 'Alpha gamma', 0.3, 2, 0.05, 0.8),
      P('chroma', 'Chroma boost', 0.5, 3, 0.05, 1.4),
    ],
    fields: p => [p.smooth],
    frag: `
void main() {
  Pop p = popAt(u_F0a, u_F0b, v_uv);
  if (p.t <= 0.0) { fragColor = vec4(0.0); return; }
  vec3 lab = vec3(0.0);
  for (int k = 0; k < 6; k++) {
    if (k >= u_ncat) break;
    lab += p.c[k] * lin2lab(toLin(u_palette[k]));
  }
  lab /= p.t;
  lab.yz *= u_chroma;
  float a = pow(tone(p.t, u_ref), u_gamma);
  fragColor = vec4(toSrgb(lab2lin(lab)) * a, a);
}`,
  },
  {
    id: 'firefly',
    name: '14. Firefly bloom',
    family: 'Surface',
    idea: 'Every N people is a light: blue-noise sparks plus a three-octave bloom (additive, tone-mapped), on a dark map. Light mixes additively, so mixed neighborhoods glow toward white while homogeneous ones keep their hue. John Nelson’s firefly cartography, as physics.',
    kind: 'field',
    params: [
      P('spark', 'Spark cell (px)', 2, 8, 0.5, 3),
      P('glow', 'Glow radius', 0.5, 4, 0.1, 1.5),
      P('exposure', 'Exposure', 0.1, 4, 0.05, 1),
    ],
    fields: p => [2 * p.glow, 7 * p.glow, 24 * p.glow],
    blend: 'add',
    basemap: 'dark',
    frag: `
vec3 emit(sampler2D a, sampler2D b) {
  Pop p = popAt(a, b, v_uv);
  vec3 e = vec3(0.0);
  for (int k = 0; k < 6; k++) {
    if (k >= u_ncat) break;
    e += p.c[k] * mix(u_palette[k], vec3(1.0), 0.12);
  }
  return e / u_ppd;
}
void main() {
  vec4 s = stipple(patPx(), u_spark, 0.3, u_Ra, u_Rb);
  vec3 col = mix(s.rgb, vec3(s.a), 0.35) * 1.4;
  // lights per px² × flat gains: halos only build up where lights crowd
  col += emit(u_F0a, u_F0b) * 10.0;
  col += emit(u_F1a, u_F1b) * 6.0;
  col += emit(u_F2a, u_F2b) * 3.0;
  col = 1.0 - exp(-col * u_exposure);
  fragColor = vec4(col, 1.0);
}`,
    legend: (_, ppd) => `1 light ≈ ${fmtPeople(ppd)} people`,
  },
  {
    id: 'faults',
    name: '15. Fault lines of difference',
    family: 'Surface',
    idea: 'The gradient magnitude of the composition vector: bright seams where who-lives-here changes abruptly, dark where it is uniform, weighted by presence so empty land stays dark. Bill Rankin’s point that boundaries are a gradient phenomenon, rendered directly; relevant to communities of interest.',
    kind: 'field',
    params: [
      P('smooth', 'Scale (px)', 1, 30, 0.5, 4),
      P('gain', 'Gain', 0.2, 6, 0.1, 2),
      REF(800),
      P('hue', 'Composition hue', 0, 1, 1, 0),
      P('light', 'Light background', 0, 1, 1, 0),
    ],
    fields: p => [p.smooth],
    blend: 'opaque',
    frag: `
void main() {
  vec2 e = vec2(u_ds) / u_css;
  Pop pc = popAt(u_F0a, u_F0b, v_uv);
  Pop pl = popAt(u_F0a, u_F0b, v_uv - vec2(e.x, 0.0));
  Pop pr = popAt(u_F0a, u_F0b, v_uv + vec2(e.x, 0.0));
  Pop pd = popAt(u_F0a, u_F0b, v_uv - vec2(0.0, e.y));
  Pop pu = popAt(u_F0a, u_F0b, v_uv + vec2(0.0, e.y));
  float g2 = 0.0;
  for (int k = 0; k < 6; k++) {
    if (k >= u_ncat) break;
    float dx = share(pr, k) - share(pl, k);
    float dy = share(pu, k) - share(pd, k);
    g2 += dx * dx + dy * dy;
  }
  float G = sqrt(g2) / (2.0 * u_ds) * u_smooth;
  float pres = tone(min(min(pl.t, pr.t), min(pd.t, pu.t)), u_ref);
  float I = clamp(G * u_gain, 0.0, 1.0) * pres;
  float dens = tone(pc.t, u_ref * 4.0);
  vec3 col;
  if (u_light > 0.5) {
    col = mix(PAPER, vec3(0.86), dens);
    col = mix(col, u_hue > 0.5 ? popColor(pc) * 0.8 : vec3(0.55, 0.05, 0.1), smoothstep(0.04, 0.5, I));
  } else {
    col = mix(vec3(0.03, 0.035, 0.045), vec3(0.15, 0.16, 0.19), dens);
    vec3 hot = u_hue > 0.5 ? min(popColor(pc) * (0.6 + 1.2 * I), vec3(1.0)) : heat(I);
    col = mix(col, hot, smoothstep(0.03, 0.4, I));
  }
  fragColor = vec4(col, 1.0);
}`,
  },

  // ---------------------------------------------------------------- simulation
  {
    id: 'langevin',
    name: '16. Langevin swarm',
    family: 'Simulation',
    idea: 'Dots as agents. Each particle is born by importance-resampling the total density, takes a group from local composition, then does Langevin dynamics on log ρ of its own group: drift up the gradient, plus noise. The stationary distribution is exactly the dot-density map, but it breathes, and after a pan or a category toggle the dots visibly find their homes.',
    kind: 'field',
    sim: 'langevin',
    animate: true,
    params: [
      P('count', 'Particles (k)', 16, 256, 16, 96),
      P('smooth', 'Field smoothing (px)', 1, 20, 0.5, 3),
      P('temp', 'Temperature (px²/s)', 0, 200, 5, 40),
      P('life', 'Mean lifetime (s)', 0.5, 20, 0.5, 6),
      P('size', 'Dot size (px)', 1, 6, 0.25, 2.25),
      REF(2500),
    ],
    fields: p => [p.smooth],
    frag: `
void main() {
  Pop p = popAt(u_F0a, u_F0b, v_uv);
  float a = 0.12 * tone(p.t, u_ref);
  fragColor = vec4(popColor(p) * a, a);
}`,
  },
  {
    id: 'stars',
    name: '21. Shooting stars',
    family: 'Simulation',
    idea: 'Meteors born where people live (importance-sampled by density), colored by the group of the person they were born from, streaking with fading trails held in a persistent GPU buffer that is reprojected as you pan/zoom. Motion options: a meteor shower, orbiting the density contours, falling into population centers, or each group falling toward its own centers, where segregation shows up as colors streaming apart.',
    kind: 'field',
    sim: 'stars',
    animate: true,
    blend: 'add',
    basemap: 'dark',
    params: [
      P('count', 'Meteors (k)', 0.25, 64, 0.25, 0.75),
      P('bright', 'Streak brightness', 0.02, 1, 0.02, 0.7),
      P('rule', 'Motion: shower/orbit/infall/own-group', 1, 4, 1, 1),
      P('speed', 'Speed (px/s)', 10, 800, 10, 260),
      P('dir', 'Shower heading (°)', 0, 360, 5, 225),
      P('spread', 'Heading spread', 0, 1, 0.05, 0.06),
      P('life', 'Mean lifetime (s)', 0.2, 4, 0.1, 0.8),
      P('trail', 'Trail persistence (s)', 0.05, 2, 0.05, 0.3),
      P('width', 'Streak width (px)', 0.5, 4, 0.25, 1.5),
      P('glow', 'Exposure', 0.2, 6, 0.1, 2.5),
      P('smooth', 'Field smoothing (px)', 1, 30, 0.5, 6),
    ],
    fields: p => [p.smooth],
    frag: `
uniform sampler2D u_trailTex;
void main() {
  vec4 T = texture(u_trailTex, v_uv);
  fragColor = vec4(1.0 - exp(-T.rgb * u_glow), 1.0);
}`,
  },
  {
    id: 'watershed',
    name: '17. Settlement watersheds',
    family: 'Simulation',
    idea: 'Treat smoothed density as terrain and let every pixel climb to its peak (steepest ascent, solved on the GPU by pointer doubling). Each basin is the catchment of a population center: emergent "natural communities" whose granularity is set by the smoothing scale. Tinted by the composition at the peak.',
    kind: 'field',
    sim: 'watershed',
    params: [
      P('smooth', 'Settlement scale (px)', 3, 60, 1, 14),
      P('min', 'Settled above (people/km²)', 5, 2000, 5, 80),
      P('tint', 'Tint by peak composition', 0, 1, 1, 1),
      REF(1500),
    ],
    fields: p => [p.smooth],
    frag: `
uniform sampler2D u_ptr;
vec4 ptrAt(vec2 uv) { return texelFetch(u_ptr, ivec2(fieldUv(uv) * u_fres), 0); }
void main() {
  vec4 q = ptrAt(v_uv);
  if (q.x < 0.0) { fragColor = vec4(0.0); return; }
  vec2 root = q.xy;
  Pop pk = popAtF(u_F0a, u_F0b, (root + 0.5) / u_fres);
  vec4 hh = hash4(ivec2(root));
  vec3 hc = 0.55 + 0.45 * cos(6.2831 * (hh.x + vec3(0.0, 0.33, 0.67)));
  vec3 c = u_tint > 0.5 ? popColor(pk) : hc;
  float edge = 0.0;
  vec2 e = 1.0 / u_css;
  for (int i = 0; i < 4; i++) {
    vec2 o = i == 0 ? vec2(e.x, 0.0) : i == 1 ? vec2(-e.x, 0.0) : i == 2 ? vec2(0.0, e.y) : vec2(0.0, -e.y);
    vec4 qn = ptrAt(v_uv + o);
    if (qn.x >= 0.0 && any(notEqual(qn.xy, root))) edge = 1.0;
  }
  Pop p = popAt(u_F0a, u_F0b, v_uv);
  float pres = tone(p.t, u_ref);
  vec2 rootPx = ((root + 0.5) / u_fres - u_fx.zw) / u_fx.xy * u_css;
  float peakR = 1.5 + 0.8 * log2(1.0 + km2(pk.t) / 200.0);
  float peak = 1.0 - smoothstep(peakR - 0.7, peakR + 0.7, length(fragPx() - rootPx));
  vec3 col = mix(PAPER, c, 0.2 + 0.65 * pres);
  col = mix(col, INK, max(edge * 0.75, peak));
  fragColor = vec4(col * 0.92, 0.92);
}`,
  },

  // ---------------------------------------------------------------- views
  {
    id: 'lens',
    name: '18. Micro/macro lens',
    family: 'Views',
    idea: "Tufte's micro/macro readings in one view: a cursor lens shows every individual dot (polygon-exact), while outside it the same data is a smooth perceptual surface. Focus+context without a second map; the lens is just a branch in the shader.",
    kind: 'field',
    params: [
      P('radius', 'Lens radius (px)', 60, 400, 10, 170),
      P('dot', 'Dot cell (px)', 2, 8, 0.5, 3),
      P('smooth', 'Outside smoothing (px)', 2, 40, 1, 10),
      REF(2500),
    ],
    fields: p => [p.smooth],
    frag: `
void main() {
  vec2 px = fragPx();
  vec2 m = u_mouse.x < -1000.0 ? 0.5 * u_css : u_mouse;
  float d = length(px - m);
  vec4 col;
  if (d < u_radius) {
    vec4 s = stipple(patPx(), u_dot, 0.42, u_Ra, u_Rb);
    col = s + vec4(PAPER, 1.0) * (1.0 - s.a);
  } else {
    Pop p = popAt(u_F0a, u_F0b, v_uv);
    float a = tone(p.t, u_ref);
    col = vec4(popColor(p) * a, a);
    float sh = (1.0 - smoothstep(0.0, 14.0, d - u_radius)) * 0.25;
    col = vec4(0.0, 0.0, 0.0, sh) + col * (1.0 - sh);
  }
  float ring = 1.0 - smoothstep(0.75, 1.75, abs(d - u_radius));
  fragColor = mix(col, vec4(INK, 1.0), ring);
}`,
    legend: (_, ppd) => `Inside lens: 1 dot ≈ ${fmtPeople(ppd)} people`,
  },
  {
    id: 'multiples',
    name: '19. Scale small multiples',
    family: 'Views',
    idea: 'The same view at four kernel bandwidths, side by side: a segregation profile across scale (cf. Reardon’s spatial segregation profiles). Patterns that persist across panels are structural; ones that vanish were artifacts of the precinct grain. Small multiples, Tufte’s favorite device.',
    kind: 'field',
    params: [
      P('base', 'Finest scale (px)', 0.5, 8, 0.5, 1),
      P('ratio', 'Scale ratio', 2, 6, 0.5, 4),
      P('enc', 'Encoding (mix/dominant/entropy)', 0, 2, 1, 1),
      REF(2500),
    ],
    fields: p => [p.base, p.base * p.ratio, p.base * p.ratio ** 2, p.base * p.ratio ** 3],
    blend: 'opaque',
    basemap: 'blank',
    quadLabels: (p, m) =>
      [p.base, p.base * p.ratio, p.base * p.ratio ** 2, p.base * p.ratio ** 3].map(
        s => `σ = ${fmtMeters(s * m)}`
      ),
    frag: `
vec4 enc(Pop p) {
  float a = tone(p.t, u_ref);
  if (u_enc < 0.5) return vec4(popColor(p) * a, a);
  if (u_enc < 1.5) {
    int k = dominant(p);
    vec3 c = mix(PAPER, u_palette[k], smoothstep(0.25, 0.9, share(p, k)));
    return vec4(c * a, a);
  }
  vec3 c = mix(vec3(0.12, 0.18, 0.45), vec3(1.0, 0.82, 0.35), entropyN(p));
  return vec4(c * a, a);
}
void main() {
  float gx = abs(v_uv.x - 0.5) * u_css.x;
  float gy = abs(v_uv.y - 0.5) * u_css.y;
  if (min(gx, gy) < 2.0) { fragColor = vec4(INK, 1.0); return; }
  vec2 luv = fract(v_uv * 2.0);
  bool right = v_uv.x > 0.5;
  bool top = v_uv.y > 0.5;
  Pop p;
  if (top && !right) p = popAt(u_F0a, u_F0b, luv);
  else if (top) p = popAt(u_F1a, u_F1b, luv);
  else if (!right) p = popAt(u_F2a, u_F2b, luv);
  else p = popAt(u_F3a, u_F3b, luv);
  vec4 c = enc(p);
  fragColor = c + vec4(PAPER, 1.0) * (1.0 - c.a);
}`,
  },
  {
    id: 'dasymetric',
    name: '20. Dasymetric dots via basemap readback',
    family: 'Views',
    idea: "The GPU reads back the basemap it just drew (buildings and residential streets painted into a mask), then moves each polygon's people onto built pixels nearby: ρ·mask / blur(mask). Dots line streets and fill blocks instead of parks, rail yards and water. Dasymetric mapping with no extra data download.",
    kind: 'field',
    readback: true,
    blend: 'opaque',
    params: [
      P('dot', 'Dot cell (px)', 1.5, 8, 0.5, 2.5),
      P('reach', 'Reallocation reach (px)', 2, 40, 1, 10),
      P('floor', 'Min built share', 0.01, 0.5, 0.01, 0.04),
      P('ghost', 'Show mask', 0, 1, 0.05, 0.35),
    ],
    fields: p => [p.reach],
    frag: `
uniform sampler2D u_Ma;
uniform sampler2D u_Mb;
void main() {
  vec2 P = patPx();
  ivec2 c = ivec2(floor(P / u_dot));
  vec2 ctr = (vec2(c) + 0.5 + (hash4(c).xy - 0.5) * 0.2) * u_dot;
  vec2 cuv = patUv(ctr);
  float m = texture(u_Ma, fieldUv(cuv)).x;
  float beta = texture(u_Mb, fieldUv(cuv)).x;
  Pop p = popAt(u_F0a, u_F0b, cuv);
  float prob = p.t * m / max(beta, u_floor) * u_dot * u_dot / u_ppd;
  vec3 col = mix(PAPER, vec3(0.80), texture(u_Ma, fieldUv(v_uv)).x * u_ghost);
  if (bn(c) < prob) {
    float r = 0.42 * u_dot;
    float cov = 1.0 - smoothstep(r - 0.6 / u_dpr, r + 0.6 / u_dpr, length(P - ctr));
    col = mix(col, u_palette[pickCat(p, bn(c + ivec2(23, 41)))], cov);
  }
  fragColor = vec4(col, 1.0);
}`,
    legend: (_, ppd) => `1 dot ≈ ${fmtPeople(ppd)} people`,
  },
];
