import edges from "./province-edges.json";
import { mercator } from "./terrainData";

/**
 * Vector province borders for the 3D renderer. Borders used to come from
 * comparing neighbouring texels of the province-id raster, which drew stair
 * steps at every zoom. These are the same shared-topology edges the 2D map
 * draws, expanded into screen-width quads and classified on the GPU from the
 * live ownership palette, so conquests restyle them without rebuilding.
 */

/** Floats per vertex: p0.xy, p1.xy, corner (side, end), ids (a+1, b+1). */
export const EDGE_STRIDE = 8;
/** Quads per draw: four vertices each keeps indices inside Uint16. */
export const EDGE_BATCH_QUADS = 16383;
/** Quads per culling cell; batches draw only their visible cells. */
export const EDGE_CELL_QUADS = 1024;

export interface EdgeMesh {
  vertices: Float32Array;
  quads: number;
  /** Mercator [minX, minY, maxX, maxY] per cell of EDGE_CELL_QUADS quads. */
  bounds: Float32Array;
}

/** Morton order on the first point keeps each batch spatially compact. */
function spatialKey(chain: number[]): number {
  const x = Math.min(65535, Math.max(0, Math.round(((chain[2] / 1e4 + 180) / 360) * 65535)));
  const y = Math.min(65535, Math.max(0, Math.round(((chain[3] / 1e4 + 90) / 180) * 65535)));
  let key = 0;
  for (let bit = 15; bit >= 0; bit -= 1) key = key * 4 + ((x >> bit) & 1) * 2 + ((y >> bit) & 1);
  return key;
}

/**
 * Build the quad mesh for every province edge and coastline. Callers upload it
 * and drop it: the GPU copy is the only one kept (about 30 MB of vertices).
 */
export function provinceEdgeMesh(): EdgeMesh {
  const chains = (edges as { chains: number[][] }).chains
    .map((chain) => ({ chain, key: spatialKey(chain) }))
    .sort((l, r) => l.key - r.key)
    .map(({ chain }) => chain);
  let quads = 0;
  for (const chain of chains) quads += (chain.length - 4) / 2;
  const vertices = new Float32Array(quads * 4 * EDGE_STRIDE);
  const bounds = new Float32Array(Math.ceil(quads / EDGE_CELL_QUADS) * 4);
  for (let i = 0; i < bounds.length; i += 4) bounds.set([Infinity, Infinity, -Infinity, -Infinity], i);
  let o = 0, quad = 0;
  for (const chain of chains) {
    const a = chain[0] + 1, b = chain[1] + 1;
    let x = chain[2], y = chain[3];
    let [px, py] = mercator(x / 1e4, y / 1e4);
    for (let i = 4; i < chain.length; i += 2) {
      x += chain[i];
      y += chain[i + 1];
      const [qx, qy] = mercator(x / 1e4, y / 1e4);
      const box = Math.floor(quad / EDGE_CELL_QUADS) * 4;
      bounds[box] = Math.min(bounds[box], px, qx);
      bounds[box + 1] = Math.min(bounds[box + 1], py, qy);
      bounds[box + 2] = Math.max(bounds[box + 2], px, qx);
      bounds[box + 3] = Math.max(bounds[box + 3], py, qy);
      quad += 1;
      for (const [side, end] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
        vertices[o++] = px; vertices[o++] = py;
        vertices[o++] = qx; vertices[o++] = qy;
        vertices[o++] = side; vertices[o++] = end;
        vertices[o++] = a; vertices[o++] = b;
      }
      px = qx; py = qy;
    }
  }
  return { vertices, quads, bounds };
}

/** Two triangles per quad, shared by every batch. */
export function edgeQuadIndices(): Uint16Array {
  const indices = new Uint16Array(EDGE_BATCH_QUADS * 6);
  for (let q = 0; q < EDGE_BATCH_QUADS; q += 1) {
    const v = q * 4;
    indices.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
  }
  return indices;
}

export const edgeVertexShader = (paletteWidth: number, heightShader: string) => `
precision highp float;
precision highp sampler2D;
attribute vec2 p0;
attribute vec2 p1;
attribute vec2 corner;
attribute vec2 ids;
uniform vec2 center;
uniform vec2 extent;
uniform vec2 tilt;
uniform float relief;
uniform vec2 viewport;
uniform float pixelRatio;
uniform sampler2D palette;
uniform float selected;
uniform float political;
uniform float provinceLines;
uniform float zoom;
${heightShader}
varying vec2 uv;
varying float across;
varying float halfWidth;
varying float alpha;
varying float kind;
float decodeId(vec2 c) { return floor(c.x*255.0+.5)+floor(c.y*255.0+.5)*256.0; }
float ownerAt(float id) { return decodeId(texture2D(palette,vec2((id-.5)/${paletteWidth}.0,.75)).ra); }
vec4 project(vec2 p) {
  float t=3.14159265*(1.0-2.0*p.y);
  float cosLatitude=2.0/(exp(t)+exp(-t));
  float z=heightAt(p)*relief/(40075016.686*max(.12,cosLatitude));
  float north=center.y-p.y;
  return vec4((p.x-center.x)/extent.x,(north*tilt.x+z*tilt.y)/extent.y,0.0,1.0);
}
void main() {
  // ids.y is 0 for coastline (b = -1 in the edge file).
  float coast=step(ids.y,.5);
  float frontier=(1.0-coast)*step(.5,abs(ownerAt(ids.x)-ownerAt(ids.y)));
  float chosen=selected>0.0 ? max(step(abs(ids.x-selected),.1),step(abs(ids.y-selected),.1)) : 0.0;
  kind=chosen>.5 ? 2.0 : (coast>.5 ? 3.0 : frontier);
  float width=chosen>.5 ? 2.6 : (coast>.5 ? 1.2 : (frontier>.5 ? 2.2 : 1.4));
  alpha=chosen>.5 ? 1.0 : (coast>.5 ? .6 : (frontier>.5 ? mix(.55,.9,political) : provinceLines*mix(.4,.7,political)));
  // Thinner at world zoom, where fragmented coasts would turn frontiers to fuzz.
  width*=mix(.6,1.0,smoothstep(1.5,3.5,zoom));
  halfWidth=width*pixelRatio*.5+.75;
  vec4 a=project(p0), b=project(p1);
  vec2 halfView=viewport*.5;
  vec2 sa=a.xy*halfView, sb=b.xy*halfView;
  vec2 d=sb-sa;
  float len=length(d);
  vec2 dir=len>1e-4 ? d/len : vec2(1.0,0.0);
  vec2 nrm=vec2(-dir.y,dir.x);
  vec4 base=corner.y<.5 ? a : b;
  // Square caps close the joints between consecutive segments.
  vec2 offset=nrm*corner.x*halfWidth+dir*(corner.y<.5 ? -1.0 : 1.0)*halfWidth*.5;
  gl_Position=alpha<.01 ? vec4(2.0,2.0,2.0,1.0) : vec4(base.xy+offset/halfView,0.0,1.0);
  across=corner.x*halfWidth;
  uv=corner.y<.5 ? p0 : p1;
}`;

export const edgeFragmentShader = (atmosphere: string, heightShader: string) => `
precision highp float;
precision highp sampler2D;
uniform float clock;
${heightShader}
varying vec2 uv;
float hash(vec2 p) {
  vec2 q=fract(p*vec2(.1031,.11369));
  q+=dot(q,q.yx+19.19);
  return fract(q.x*q.y*95.43);
}
float noise(vec2 p) {
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
${atmosphere}
varying float across;
varying float halfWidth;
varying float alpha;
varying float kind;
void main() {
  float d=abs(across);
  // One pixel of coverage falloff: anti-aliased at any width and zoom.
  float coverage=1.0-smoothstep(halfWidth-1.0,halfWidth,d);
  float edge=smoothstep(halfWidth*.35,halfWidth*.85,d);
  vec3 pale=vec3(.95,.88,.66), ink=vec3(.13,.13,.11);
  // Frontiers: pale rule with an ink casing. Province rules: ink with a pale
  // casing, readable on dark nation fills and light terrain alike.
  vec3 color=kind>2.5 ? vec3(.10,.12,.12) : (kind>1.5 ? vec3(.96,.79,.38) : (kind>.5 ? mix(pale,ink,edge*.8) : mix(ink,pale,edge*.7)));
  vec3 sun=sunAt(uv);
  vec3 weather=weatherAt(uv,heightAt(uv));
  gl_FragColor=vec4(atmosphereColor(color,sun,weather),alpha*coverage);
}`;
