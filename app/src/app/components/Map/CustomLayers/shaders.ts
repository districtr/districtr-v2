/**
 * GLSL (WebGL2 / GLSL ES 3.00) for the procedural dot density layer.
 *
 * The fragment shader stipples dots from a global power-of-two grid over the
 * mercator [0,1]² world. Cell ids are world-stable integers, so dot positions
 * are deterministic across tiles, frames, and zooms. Vertices are tile-local
 * [0,1]; the composed u_matrix carries all large mercator magnitudes (built in
 * float64 on the CPU), which is what keeps high zooms jitter-free in float32.
 *
 * Per-feature race-category densities live in a per-tile RGBA32F texture,
 * 2 texels per feature:
 *   texel 2i   = densities of categories 0..3
 *   texel 2i+1 = (density 4, density 5, total-population density, unused)
 * A dot exists by Bernoulli thinning against the total density; its category
 * comes from re-using the same hash draw against the cumulative category sums.
 */

export const DOT_DENSITY_VERT = `#version 300 es
in vec2 a_pos;
in float a_fidx;
uniform mat4 u_matrix;
out vec2 v_local;
flat out int v_fidx;
void main() {
  v_local = a_pos;
  v_fidx = int(a_fidx);
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}`;

export const DOT_DENSITY_FRAG = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_local;
flat in int v_fidx;
uniform sampler2D u_density;  // RGBA32F, 2 texels per feature
uniform int u_texWidth;
uniform vec2 u_cellOrigin;    // tile origin in cell units; integer-valued, <= 2^24 so exact in f32
uniform float u_cellsPerTile; // 2^(n - dataZoom)
uniform float u_cellAreaWorld;// 4^-n
uniform float u_peoplePerDot;
uniform float u_dotRadius;    // in cell units, < 0.5
uniform vec3 u_palette[6];
uniform float u_opacity;
out vec4 fragColor;

// pcg2d hash: uint in, well-distributed uint out
uvec2 pcg2d(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return v;
}

vec4 texelAt(int i) {
  return texelFetch(u_density, ivec2(i % u_texWidth, i / u_texWidth), 0);
}

void main() {
  // Kill the tippecanoe buffer: tiles then partition the plane exactly and
  // edge dots are completed identically by the neighboring tile.
  if (v_local.x < 0.0 || v_local.x >= 1.0 || v_local.y < 0.0 || v_local.y >= 1.0) discard;

  vec2 cellF = v_local * u_cellsPerTile;
  vec2 cellIdx = floor(cellF);
  uvec2 cell = uvec2(u_cellOrigin + cellIdx);
  uvec2 h2 = pcg2d(cell);
  vec4 h = vec4(
    float(h2.x & 0xffffu),
    float(h2.x >> 16u),
    float(h2.y & 0xffffu),
    float(h2.y >> 16u)
  ) / 65535.0;

  vec4 dA = texelAt(2 * v_fidx);
  vec4 dB = texelAt(2 * v_fidx + 1);
  float totalDensity = dB.z;

  // Bernoulli thinning: expected dots per cell from the feature's density
  float expected = min(totalDensity * u_cellAreaWorld / u_peoplePerDot, 1.0);
  if (expected <= 0.0 || h.z >= expected) discard;

  // Category from an independent hash channel over the cumulative sums
  float cats[6] = float[6](dA.x, dA.y, dA.z, dA.w, dB.x, dB.y);
  float catSum = cats[0] + cats[1] + cats[2] + cats[3] + cats[4] + cats[5];
  if (catSum <= 0.0) discard;
  float r = h.w * catSum;
  int k = 5;
  float acc = 0.0;
  for (int i = 0; i < 6; i++) {
    acc += cats[i];
    if (r < acc) { k = i; break; }
  }

  // Jitter keeps the whole disc inside its cell: complete circles, no overlap
  vec2 center = cellIdx + 0.5 + (h.xy - 0.5) * (1.0 - 2.0 * u_dotRadius);
  float d = distance(cellF, center);
  float aa = max(fwidth(d), 1e-4);
  float coverage = 1.0 - smoothstep(u_dotRadius - aa, u_dotRadius + aa, d);
  if (coverage <= 0.0) discard;

  float alpha = u_opacity * coverage;
  fragColor = vec4(u_palette[k] * alpha, alpha);
}`;

export const compileProgram = (
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string
): WebGLProgram => {
  const compile = (type: number, src: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Dot density shader compile failed: ${log}`);
    }
    return shader;
  };
  const program = gl.createProgram()!;
  const vert = compile(gl.VERTEX_SHADER, vertSrc);
  const frag = compile(gl.FRAGMENT_SHADER, fragSrc);
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Dot density program link failed: ${log}`);
  }
  return program;
};
