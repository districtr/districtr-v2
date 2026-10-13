/**
 * Shared GLSL for the dot density lab (/lab/dots).
 *
 * Pipeline: tile polygons → "population field" (screen-space, per-category
 * people density, 2 RGBA attachments) → separable Gaussian blurs at the
 * sigmas a mode asks for → one full-screen composite shader per mode.
 *
 * Field texel layout (both raw and blurred):
 *   A = categories 0..3, B = (category 4, category 5, enabled total, coverage)
 * Values are people per world-unit² × 4^-20 (zoom-invariant, fits float16);
 * u_toPx converts to people per CSS px².
 */

export const FULLSCREEN_VERT = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Tile triangles; u_shrink maps the viewport into the margin-padded field. */
export const TILE_VERT = `#version 300 es
layout(location = 0) in vec2 a_pos;
layout(location = 1) in float a_fidx;
uniform mat4 u_matrix;
uniform vec2 u_shrink;
out vec2 v_local;
flat out int v_fidx;
void main() {
  v_local = a_pos;
  v_fidx = int(a_fidx);
  vec4 p = u_matrix * vec4(a_pos, 0.0, 1.0);
  p.xy *= u_shrink;
  gl_Position = p;
}`;

export const FIELD_FRAG = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_local;
flat in int v_fidx;
uniform sampler2D u_density;
uniform int u_texWidth;
uniform float u_scale;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
vec4 texelAt(int i) {
  return texelFetch(u_density, ivec2(i % u_texWidth, i / u_texWidth), 0);
}
void main() {
  if (v_local.x < 0.0 || v_local.x >= 1.0 || v_local.y < 0.0 || v_local.y >= 1.0) discard;
  vec4 a = texelAt(2 * v_fidx);
  vec4 b = texelAt(2 * v_fidx + 1);
  o0 = a * u_scale;
  o1 = vec4(b.xyz * u_scale, 1.0);
}`;

export const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src0;
uniform sampler2D u_src1;
uniform vec2 u_dir;     // one texel along the blur axis, in uv
uniform float u_sigma;  // in texels
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
void main() {
  if (u_sigma < 0.5) {
    o0 = texture(u_src0, v_uv);
    o1 = texture(u_src1, v_uv);
    return;
  }
  float radius = ceil(3.0 * u_sigma);
  // ponytail: taps capped at 2*48+1 and stretched for huge sigmas; blurs
  // chain from the previous level so the source is already smooth
  int n = int(min(radius, 48.0));
  float stepT = radius / float(n);
  vec4 s0 = vec4(0.0);
  vec4 s1 = vec4(0.0);
  float wsum = 0.0;
  for (int i = -n; i <= n; i++) {
    float x = float(i) * stepT;
    float w = exp(-0.5 * x * x / (u_sigma * u_sigma));
    vec2 uv = v_uv + u_dir * x;
    s0 += w * texture(u_src0, uv);
    s1 += w * texture(u_src1, uv);
    wsum += w;
  }
  o0 = s0 / wsum;
  o1 = s1 / wsum;
}`;

/** Basemap readback → built-environment mask (magenta mask layers). */
export const MASK_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_back;
uniform vec4 u_fx;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
void main() {
  vec2 uv = (v_uv - u_fx.zw) / u_fx.xy;
  float m = 0.0;
  if (uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0) {
    vec3 c = texture(u_back, uv).rgb;
    m = smoothstep(0.35, 0.6, min(c.r, c.b) - c.g);
  }
  o0 = vec4(m);
  o1 = vec4(0.0);
}`;

/** Watershed: each field texel points at its steepest-ascent neighbor. */
export const WATERSHED_INIT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_tot;
uniform float u_min;
out vec4 o;
void main() {
  ivec2 x = ivec2(gl_FragCoord.xy);
  ivec2 sz = textureSize(u_tot, 0);
  float d0 = texelFetch(u_tot, x, 0).z;
  if (d0 < u_min) { o = vec4(-1.0, -1.0, d0, 0.0); return; }
  ivec2 best = x;
  float bv = d0;
  for (int dy = -2; dy <= 2; dy++) {
    for (int dx = -2; dx <= 2; dx++) {
      ivec2 y = clamp(x + ivec2(dx, dy), ivec2(0), sz - 1);
      float v = texelFetch(u_tot, y, 0).z;
      if (v > bv) { bv = v; best = y; }
    }
  }
  o = vec4(vec2(best), d0, 0.0);
}`;

/** Watershed: pointer doubling, p(x) ← p(p(x)); log2(path) passes find the peak. */
export const WATERSHED_JUMP_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_ptr;
out vec4 o;
void main() {
  vec4 p = texelFetch(u_ptr, ivec2(gl_FragCoord.xy), 0);
  if (p.x < 0.0) { o = p; return; }
  vec4 q = texelFetch(u_ptr, ivec2(p.xy), 0);
  o = vec4(q.x < 0.0 ? p.xy : q.xy, p.z, 0.0);
}`;

export const PARTICLE_VERT = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform int u_S;
uniform vec4 u_a2s;
uniform vec2 u_css;
uniform float u_dpr;
uniform float u_size;
uniform vec3 u_palette[6];
out vec3 v_col;
out float v_a;
void main() {
  vec4 s = texelFetch(u_state, ivec2(gl_VertexID % u_S, gl_VertexID / u_S), 0);
  vec2 scr = s.xy * u_a2s.xy + u_a2s.zw;
  gl_Position = vec4(scr / u_css * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = u_size * u_dpr;
  v_col = u_palette[clamp(int(s.z), 0, 5)];
  v_a = smoothstep(0.0, 0.6, s.w);
}`;

export const PARTICLE_FRAG = `#version 300 es
precision highp float;
in vec3 v_col;
in float v_a;
out vec4 fragColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.36, 0.5, d)) * v_a;
  if (a <= 0.0) discard;
  fragColor = vec4(v_col * a, a);
}`;

/** Prepended to every composite (and particle update) shader. */
export const PRELUDE = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_res;      // drawing buffer px
uniform vec2 u_css;      // viewport CSS px
uniform float u_dpr;
uniform float u_zoom;
uniform float u_time;    // seconds
uniform vec2 u_pan;      // pan-stable pattern offset, CSS px, y-up, mod 65536
uniform vec2 u_mouse;    // CSS px, y-up; x < -1e3 when off-map
uniform vec3 u_palette[6];
uniform int u_ncat;
uniform float u_toPx;    // field value → people per CSS px²
uniform vec4 u_fx;       // screen uv → field uv
uniform vec2 u_fres;     // field size in texels
uniform float u_ds;      // CSS px per field texel
uniform float u_mPerPx;  // meters per CSS px at view center
uniform float u_ppd;     // people per dot at this zoom (× density factor)
uniform sampler2D u_noise;  // 64² void-and-cluster blue noise
uniform sampler2D u_Ra; uniform sampler2D u_Rb;
uniform sampler2D u_F0a; uniform sampler2D u_F0b;
uniform sampler2D u_F1a; uniform sampler2D u_F1b;
uniform sampler2D u_F2a; uniform sampler2D u_F2b;
uniform sampler2D u_F3a; uniform sampler2D u_F3b;

const float PI = 3.14159265;
const vec3 PAPER = vec3(0.976, 0.969, 0.952);
const vec3 INK = vec3(0.09, 0.09, 0.11);

struct Pop { float c[6]; float t; float cover; };

vec2 fieldUv(vec2 uv) { return uv * u_fx.xy + u_fx.zw; }

Pop popAtF(sampler2D a, sampler2D b, vec2 f) {
  vec4 A = texture(a, f) * u_toPx;
  vec4 B = texture(b, f);
  Pop p;
  p.c[0] = A.x; p.c[1] = A.y; p.c[2] = A.z; p.c[3] = A.w;
  p.c[4] = B.x * u_toPx; p.c[5] = B.y * u_toPx;
  p.t = B.z * u_toPx;
  p.cover = B.w;
  return p;
}
Pop popAt(sampler2D a, sampler2D b, vec2 uv) { return popAtF(a, b, fieldUv(uv)); }
float totalAt(sampler2D b, vec2 uv) { return texture(b, fieldUv(uv)).z * u_toPx; }

vec2 fragPx() { return gl_FragCoord.xy / u_dpr; }
vec2 patPx() { return fragPx() + u_pan; }
vec2 patUv(vec2 P) { return (P - u_pan) / u_css; }
float km2(float perPx) { return perPx * 1e6 / (u_mPerPx * u_mPerPx); }
/** Ink coverage for a density; ref = people/km² at ~63% ink. */
float tone(float perPx, float ref) { return 1.0 - exp(-km2(perPx) / ref); }

// ---- color ----
vec3 toLin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
vec3 toSrgb(vec3 c) { return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }
vec3 lin2lab(vec3 c) {
  float l = pow(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b, 1.0 / 3.0);
  float m = pow(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b, 1.0 / 3.0);
  float s = pow(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b, 1.0 / 3.0);
  return vec3(0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
              1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
              0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}
vec3 lab2lin(vec3 L) {
  float l = L.x + 0.3963377774 * L.y + 0.2158037573 * L.z;
  float m = L.x - 0.1055613458 * L.y - 0.0638541728 * L.z;
  float s = L.x - 0.0894841775 * L.y - 1.2914855480 * L.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return vec3( 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
              -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
              -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}
/** Perceptual (OKLab) mean of the category colors, weighted by count. */
vec3 popColor(Pop p) {
  vec3 acc = vec3(0.0);
  float w = 0.0;
  for (int k = 0; k < 6; k++) {
    if (k >= u_ncat) break;
    acc += p.c[k] * lin2lab(toLin(u_palette[k]));
    w += p.c[k];
  }
  return w > 0.0 ? toSrgb(lab2lin(acc / w)) : vec3(0.6);
}
/** Category whose cumulative share brackets r in [0,1). */
int pickCat(Pop p, float r) {
  float x = r * p.t;
  float acc = 0.0;
  int last = 0;
  for (int k = 0; k < 6; k++) {
    if (k >= u_ncat) break;
    if (p.c[k] <= 0.0) continue;
    acc += p.c[k];
    last = k;
    if (x < acc) return k;
  }
  return last;
}
int dominant(Pop p) {
  int best = 0;
  float bv = -1.0;
  for (int k = 0; k < 6; k++) {
    if (k >= u_ncat) break;
    if (p.c[k] > bv) { bv = p.c[k]; best = k; }
  }
  return best;
}
float share(Pop p, int k) { return p.t > 0.0 ? p.c[k] / p.t : 0.0; }
float entropyN(Pop p) {
  float h = 0.0;
  for (int k = 0; k < 6; k++) {
    if (k >= u_ncat) break;
    float s = share(p, k);
    if (s > 0.0) h -= s * log(s);
  }
  return u_ncat > 1 ? h / log(float(u_ncat)) : 0.0;
}
vec3 heat(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 a = vec3(0.04, 0.03, 0.10), b = vec3(0.50, 0.08, 0.45);
  vec3 c = vec3(0.97, 0.42, 0.10), d = vec3(1.0, 0.96, 0.72);
  if (t < 0.35) return mix(a, b, t / 0.35);
  if (t < 0.7) return mix(b, c, (t - 0.35) / 0.35);
  return mix(c, d, (t - 0.7) / 0.3);
}

// ---- hashing / noise ----
uvec2 pcg2d(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return v;
}
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec4 hash4(ivec2 c) {
  uvec2 s = pcg2d(uvec2(c) ^ uvec2(0x68E31DA4u, 0xB5297A4Du));
  uvec2 t = pcg2d(s);
  return vec4(float(s.x & 0xffffu), float(s.x >> 16u), float(t.x & 0xffffu), float(t.x >> 16u)) / 65536.0;
}
vec3 rand3(ivec3 c) { return vec3(pcg3d(uvec3(c)) >> 8u) / 16777216.0; }
float bn(ivec2 c) { return texelFetch(u_noise, c & 63, 0).r; }
float bnSmooth(vec2 p) { return texture(u_noise, p / 64.0).r; }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash4(ivec2(i)).x, b = hash4(ivec2(i) + ivec2(1, 0)).x;
  float c = hash4(ivec2(i) + ivec2(0, 1)).x, d = hash4(ivec2(i) + ivec2(1, 1)).x;
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

/**
 * Blue-noise FM stipple: one candidate dot per d×d cell, kept when the
 * cell's blue-noise rank is under the expected dot count (= people/ppd).
 * Blue-noise thresholds space kept dots apart (no clumps); full-cell jitter
 * and overlap (3×3 search, rank as depth) hide the lattice. A second,
 * shifted rank picks the color, so groups interleave evenly and mix
 * optically. rFrac = dot radius / d. Returns premultiplied color.
 */
vec4 stipple(vec2 P, float d, float rFrac, sampler2D a, sampler2D b) {
  ivec2 c0 = ivec2(floor(P / d));
  float r = rFrac * d;
  float aa = 0.6 / u_dpr;
  vec4 best = vec4(0.0);
  float bestRank = 2.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      ivec2 c = c0 + ivec2(dx, dy);
      float rank = bn(c);
      if (rank >= bestRank) continue;
      vec2 ctr = (vec2(c) + 0.5 + (hash4(c).xy - 0.5) * 0.9) * d;
      float cov = 1.0 - smoothstep(r - aa, r + aa, length(P - ctr));
      if (cov <= 0.0) continue;
      Pop p = popAt(a, b, patUv(ctr));
      if (rank >= p.t * d * d / u_ppd) continue;
      int k = pickCat(p, bn(c + ivec2(23, 41)));
      best = vec4(u_palette[k] * cov, cov);
      bestRank = rank;
    }
  }
  return best;
}
`;

/**
 * Particle update (appended to PRELUDE with two outputs). State per particle:
 *   s0 = (anchor-px x, anchor-px y, category, life left)
 *   s1 = (heading x, heading y, lifetime at birth, 0)
 * u_rule: 0 Langevin on own group · 1 straight shower · 2 orbit contours ·
 *         3 fall up total density · 4 fall up own group's density.
 * Births importance-resample the total density, so particle density ∝ people.
 */
export const PARTICLE_UPDATE_BODY = `
uniform sampler2D u_s0;
uniform sampler2D u_s1;
uniform vec4 u_a2s;
uniform float u_dt;
uniform float u_D;
uniform float u_life;
uniform float u_frame;
uniform float u_reset;
uniform float u_rule;
uniform float u_speed;
uniform float u_dir;
uniform float u_spread;
float lrho(int k, vec2 px) {
  Pop p = popAt(u_F0a, u_F0b, px / u_css);
  return log((k < 0 ? p.t : p.c[k]) + 1e-7);
}
vec2 glog(int k, vec2 px) {
  float e = 1.5;
  return vec2(lrho(k, px + vec2(e, 0.0)) - lrho(k, px - vec2(e, 0.0)),
              lrho(k, px + vec2(0.0, e)) - lrho(k, px - vec2(0.0, e))) / (2.0 * e);
}
void main() {
  ivec2 id = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(u_s0, id, 0);
  vec4 v = texelFetch(u_s1, id, 0);
  vec2 scr = s.xy * u_a2s.xy + u_a2s.zw;
  float life = s.w - u_dt;
  bool off = scr.x < -40.0 || scr.y < -40.0 || scr.x > u_css.x + 40.0 || scr.y > u_css.y + 40.0;
  int fr = int(u_frame);
  if (u_reset > 0.5 || life <= 0.0 || off) {
    float wsum = 0.0;
    vec2 pick = vec2(0.0);
    for (int i = 0; i < 12; i++) {
      vec3 r = rand3(ivec3(id.x * 16 + i, id.y, fr));
      vec2 q = r.xy * u_css;
      float w = totalAt(u_F0b, r.xy);
      wsum += w;
      if (r.z * wsum < w) pick = q;
    }
    vec3 r = rand3(ivec3(id, fr + 7777));
    if (wsum <= 0.0) {
      // nobody here; park offscreen and retry next frame
      fragColor = vec4((vec2(-1e4) - u_a2s.zw) / u_a2s.xy, 0.0, 0.0);
      fragColor2 = vec4(0.0);
      return;
    }
    Pop p = popAt(u_F0a, u_F0b, pick / u_css);
    float L = u_life * (0.4 + 1.2 * r.y);
    float ang = radians(u_dir) + (r.z - 0.5) * 2.0 * PI * u_spread;
    fragColor = vec4((pick - u_a2s.zw) / u_a2s.xy, float(pickCat(p, r.x)), L);
    fragColor2 = vec4(cos(ang), sin(ang), L, 0.0);
    return;
  }
  int k = int(s.z);
  vec3 r = rand3(ivec3(id, fr));
  vec2 stepv;
  if (u_rule < 0.5) {
    vec2 z = sqrt(-2.0 * log(max(r.x, 1e-7))) * vec2(cos(2.0 * PI * r.y), sin(2.0 * PI * r.y));
    stepv = u_D * glog(k, scr) * u_dt + sqrt(2.0 * u_D * u_dt) * z;
    float sl = length(stepv);
    if (sl > 6.0) stepv *= 6.0 / sl;
  } else {
    vec2 dir = v.xy;
    if (u_rule > 1.5) {
      vec2 g = glog(u_rule > 3.5 ? k : -1, scr);
      float l = length(g);
      if (l > 1e-6) dir = g / l;
      if (u_rule < 2.5) dir = vec2(-dir.y, dir.x);
    }
    stepv = dir * u_speed * u_dt;
  }
  scr += stepv;
  fragColor = vec4((scr - u_a2s.zw) / u_a2s.xy, s.z, life);
  fragColor2 = v;
}`;

/** One quad per particle, from last frame's position to this frame's. */
export const STREAK_VERT = `#version 300 es
precision highp float;
uniform sampler2D u_old;
uniform sampler2D u_new;
uniform sampler2D u_new1;
uniform int u_S;
uniform vec4 u_a2s;
uniform vec2 u_css;
uniform float u_width;
uniform vec3 u_palette[6];
out vec3 v_col;
out float v_a;
const vec2 CORNERS[6] = vec2[6](vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(1.0, 1.0),
                                vec2(0.0, 0.0), vec2(1.0, 1.0), vec2(0.0, 1.0));
void main() {
  int pid = gl_VertexID / 6;
  vec2 c = CORNERS[gl_VertexID % 6];
  ivec2 id = ivec2(pid % u_S, pid / u_S);
  vec4 o = texelFetch(u_old, id, 0);
  vec4 n = texelFetch(u_new, id, 0);
  float L = max(texelFetch(u_new1, id, 0).z, 1e-3);
  vec2 b = n.xy * u_a2s.xy + u_a2s.zw;
  // a respawn would draw a streak across the screen; collapse it
  vec2 a = n.w > o.w ? b : o.xy * u_a2s.xy + u_a2s.zw;
  vec2 d = b - a;
  float len = length(d);
  vec2 t = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 nn = vec2(-t.y, t.x);
  float hw = 0.5 * u_width;
  vec2 p = mix(a - t * hw, b + t * hw, c.x) + nn * hw * (c.y * 2.0 - 1.0);
  gl_Position = vec4(p / u_css * 2.0 - 1.0, 0.0, 1.0);
  v_a = n.w > 0.0 ? sin(3.14159265 * clamp(n.w / L, 0.0, 1.0)) : 0.0;
  v_col = u_palette[clamp(int(n.z), 0, 5)];
}`;

export const STREAK_FRAG = `#version 300 es
precision highp float;
in vec3 v_col;
in float v_a;
uniform float u_bright;
out vec4 fragColor;
void main() {
  fragColor = vec4(mix(v_col, vec3(1.0), 0.15) * v_a, v_a) * u_bright;
}`;

/** Trail persistence: last frame's trails, reprojected to the current view, decayed. */
export const TRAIL_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_prev;
uniform vec4 u_c2p;
uniform vec2 u_css;
uniform float u_decay;
out vec4 o;
void main() {
  vec2 uv = (v_uv * u_css * u_c2p.xy + u_c2p.zw) / u_css;
  bool inside = uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0;
  o = inside ? texture(u_prev, uv) * u_decay : vec4(0.0);
}`;
