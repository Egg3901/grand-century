import {
  clamp,
  geographic,
  mercator,
  MESH_SEGMENTS,
  normalizeView,
  provinceAt,
  terrainHeight,
  type TerrainData,
  type View,
} from "./terrainData";

const vertex = `
attribute vec3 position;
attribute vec3 normal;
uniform vec2 center;
uniform vec2 extent;
uniform vec2 tilt;
varying vec2 uv;
varying vec3 n;
void main() {
  float north = center.y - position.y;
  gl_Position = vec4((position.x-center.x)/extent.x,
    (north*tilt.x+position.z*tilt.y)/extent.y,
    (north*tilt.y-position.z*tilt.x)/(extent.y*6.0),1.0);
  uv = position.xy; n = normal;
}`;
const fragment = `
precision highp float;
uniform sampler2D surface;
uniform sampler2D provinces;
uniform sampler2D palette;
uniform float clock;
uniform float political;
uniform float selected;
uniform float texel;
varying vec2 uv;
varying vec3 n;
float idAt(vec2 p) { vec2 c=texture2D(provinces,p).rg; return floor(c.r*255.0+.5)+floor(c.g*255.0+.5)*256.0; }
void main() {
  if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0) discard;
  vec4 ground=texture2D(surface,uv);
  float id=idAt(uv);
  vec3 sun=normalize(vec3(-.4,-.55,.8));
  if(id<.5) {
    vec2 p=uv*2400.0;
    float a=p.x*.74+p.y*.47+sin(p.x*.13+p.y*.17)*2.0+clock*.38;
    float b=p.x*-.42+p.y*1.21+sin(p.x*.21-p.y*.11)*2.0-clock*.27;
    vec3 wn=normalize(vec3(cos(a)*.13+cos(b)*.065,sin(a)*.09+sin(b)*.055,1.0));
    float glint=pow(max(0.0,dot(wn,normalize(sun+vec3(0.0,-.65,.76)))),64.0);
    float ripple=sin(a)*.002+sin(b)*.002;
    vec3 sea=mix(vec3(.035,.14,.21),vec3(.13,.36,.40),ground.a*.9);
    sea+=vec3(.40,.47,.45)*glint*.58+vec3(ripple);
    gl_FragColor=vec4(sea,1.0); return;
  }
  float light=.63+.40*max(0.0,dot(normalize(n),sun));
  vec3 pigment=texture2D(palette,vec2((id-.5)/1024.0,.5)).rgb;
  vec3 land=mix(ground.rgb,ground.rgb*.38+pigment*.62,political)*light;
  float border=step(.5,abs(id-idAt(uv+vec2(texel,0.0))))+step(.5,abs(id-idAt(uv+vec2(0.0,texel))));
  land=mix(land,vec3(.23,.24,.18),min(1.0,border)*.4);
  if(abs(id-selected)<.1) land=mix(land,vec3(.96,.79,.38),.22+min(1.0,border)*.48);
  gl_FragColor=vec4(land,1.0);
}`;

/** Single draw call, fixed 32,768 triangle budget, no scene-graph allocations per frame. */
export class TerrainRenderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private vertexBuffer: WebGLBuffer;
  private indexBuffer: WebGLBuffer;
  private textures: WebGLTexture[] = [];
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private meshKey = "";
  private paletteKey = "";
  private count = 0;
  private width = 1;
  private height = 1;
  private extent: [number, number] = [0.1, 0.1];
  private disposed = false;
  private view: View = { lon: 8, lat: 40, zoom: 3 };
  private readonly tilt: [number, number] = [
    Math.cos(Math.PI / 4),
    Math.sin(Math.PI / 4),
  ];
  readonly data: TerrainData;
  constructor(gl: WebGLRenderingContext, data: TerrainData) {
    this.gl = gl;
    this.data = data;
    if (gl.getParameter(gl.MAX_TEXTURE_SIZE) < data.provinceSize)
      throw new Error("This device requires the 2D map");
    const shaders: WebGLShader[] = [];
    const compile = (source: string, type: number) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Unable to create terrain shader");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(message ?? "Terrain shader failed");
      }
      shaders.push(shader);
      return shader;
    };
    const program = gl.createProgram();
    if (!program) throw new Error("Unable to create terrain program");
    try {
      gl.attachShader(program, compile(vertex, gl.VERTEX_SHADER));
      gl.attachShader(program, compile(fragment, gl.FRAGMENT_SHADER));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program) ?? "Terrain link failed");
    } catch (e) {
      gl.deleteProgram(program);
      throw e;
    } finally {
      shaders.forEach((s) => gl.deleteShader(s));
    }
    this.program = program;
    const vertexBuffer = gl.createBuffer(),
      indexBuffer = gl.createBuffer();
    if (!vertexBuffer || !indexBuffer) {
      gl.deleteBuffer(vertexBuffer);
      gl.deleteBuffer(indexBuffer);
      gl.deleteProgram(program);
      throw new Error("Unable to allocate terrain buffers");
    }
    this.vertexBuffer = vertexBuffer;
    this.indexBuffer = indexBuffer;
    try {
      for (const name of [
        "center",
        "extent",
        "tilt",
        "surface",
        "provinces",
        "palette",
        "clock",
        "political",
        "selected",
        "texel",
      ])
        this.uniforms[name] = gl.getUniformLocation(program, name);
      const ids = new Uint8Array(data.provinceSize * data.provinceSize * 4);
      for (let i = 0; i < data.provinces.length; i++) {
        ids[i * 4] = data.provinces[i] & 255;
        ids[i * 4 + 1] = data.provinces[i] >> 8;
        ids[i * 4 + 3] = 255;
      }
      this.texture(data.size, data.size, data.surface, true);
      this.texture(data.provinceSize, data.provinceSize, ids, false);
      this.texture(1024, 1, new Uint8Array(4096).fill(180), false);
      const indices = new Uint16Array(MESH_SEGMENTS * MESH_SEGMENTS * 6);
      let k = 0;
      for (let y = 0; y < MESH_SEGMENTS; y++)
        for (let x = 0; x < MESH_SEGMENTS; x++) {
          const a = y * (MESH_SEGMENTS + 1) + x,
            b = a + 1,
            c = a + MESH_SEGMENTS + 1,
            d = c + 1;
          indices.set([a, c, b, b, c, d], k);
          k += 6;
        }
      this.count = indices.length;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      if (gl.getError() !== gl.NO_ERROR)
        throw new Error("Unable to allocate terrain graphics memory");
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  private texture(w: number, h: number, pixels: Uint8Array, linear: boolean) {
    const gl = this.gl,
      texture = gl.createTexture();
    if (!texture) throw new Error("Unable to allocate terrain texture");
    this.textures.push(texture);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      linear ? gl.LINEAR : gl.NEAREST,
    );
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MAG_FILTER,
      linear ? gl.LINEAR : gl.NEAREST,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      w,
      h,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
  }
  setPalette(colors: ReadonlyArray<readonly number[]>) {
    const key = colors.map((c) => c.join(",")).join(";");
    if (key === this.paletteKey) return;
    this.paletteKey = key;
    const pixels = new Uint8Array(4096);
    for (let i = 0; i < Math.min(1024, colors.length); i++)
      pixels.set([colors[i][0], colors[i][1], colors[i][2], 255], i * 4);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.textures[2]);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      1024,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
  }
  setView(view: View, width: number, height: number) {
    this.view = normalizeView(view);
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const span = 1 / 2 ** this.view.zoom;
    this.extent = [(span * this.width) / this.height / 2, span / 2];
    const [x, y] = mercator(this.view.lon, this.view.lat),
      level = Math.floor(this.view.zoom * 4) / 4,
      step = 1 / 2 ** level / 8;
    const cx = Math.round(x / step) * step,
      cy = Math.round(y / step) * step;
    const key = [cx, cy, level, width, height].join(",");
    if (key === this.meshKey) return;
    this.meshKey = key;
    const ex = (((1 / 2 ** level) * this.width) / this.height) * 0.8,
      ey = (1 / 2 ** level / this.tilt[0]) * 0.8;
    const vertices = new Float32Array((MESH_SEGMENTS + 1) ** 2 * 6);
    let k = 0;
    const eps = 1 / this.data.size;
    for (let y = 0; y <= MESH_SEGMENTS; y++)
      for (let x = 0; x <= MESH_SEGMENTS; x++) {
        const u = cx - ex + (x / MESH_SEGMENTS) * ex * 2,
          v = cy - ey + (y / MESH_SEGMENTS) * ey * 2;
        const h = terrainHeight(this.data, u, v);
        const dx =
          (terrainHeight(this.data, u + eps, v) -
            terrainHeight(this.data, u - eps, v)) /
          (2 * eps);
        const dy =
          (terrainHeight(this.data, u, v + eps) -
            terrainHeight(this.data, u, v - eps)) /
          (2 * eps);
        vertices.set([u, v, h, -dx, dy, 1], k);
        k += 6;
      }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.DYNAMIC_DRAW);
  }
  project(lon: number, lat: number): [number, number] {
    const [cx, cy] = mercator(this.view.lon, this.view.lat),
      [x, y] = mercator(lon, lat);
    const py =
      ((cy - y) * this.tilt[0] +
        terrainHeight(this.data, x, y) * this.tilt[1]) /
      this.extent[1];
    return [
      (((x - cx) / this.extent[0] + 1) * this.width) / 2,
      ((1 - py) * this.height) / 2,
    ];
  }
  unproject(px: number, py: number): [number, number] {
    const [cx, cy] = mercator(this.view.lon, this.view.lat);
    const x = cx + ((px / this.width) * 2 - 1) * this.extent[0];
    const north = (1 - (py / this.height) * 2) * this.extent[1];
    const base = cy - north / this.tilt[0];
    const f = (y: number) =>
      (cy - y) * this.tilt[0] +
      terrainHeight(this.data, x, y) * this.tilt[1] -
      north;
    // Walk the view ray from the near side; fixed-point iteration fails on steep slopes.
    let near = base + 0.04,
      far = base;
    for (let i = 1; i <= 96; i++) {
      const y = base + 0.04 * (1 - i / 96);
      if (f(y) >= 0) {
        far = y;
        break;
      }
      near = y;
    }
    for (let i = 0; i < 14; i++) {
      const mid = (near + far) / 2;
      if (f(mid) >= 0) far = mid;
      else near = mid;
    }
    return geographic(x, (near + far) / 2);
  }
  pan(dx: number, dy: number): View {
    const [x, y] = mercator(this.view.lon, this.view.lat);
    const [lon, lat] = geographic(
      x - (dx / this.width) * this.extent[0] * 2,
      y - ((dy / this.height) * this.extent[1] * 2) / this.tilt[0],
    );
    return normalizeView({ ...this.view, lon, lat });
  }
  provinceAtPoint(x: number, y: number): number | null {
    const [lon, lat] = this.unproject(x, y);
    if (lon < -180 || lon > 180 || Math.abs(lat) > 85) return null;
    return provinceAt(this.data, lon, lat);
  }
  render(time: number, political: boolean, selected: number | null) {
    if (this.disposed) return;
    const gl = this.gl;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0.035, 0.1, 0.15, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    for (const [name, offset] of [
      ["position", 0],
      ["normal", 12],
    ] as const) {
      const at = gl.getAttribLocation(this.program, name);
      gl.enableVertexAttribArray(at);
      gl.vertexAttribPointer(at, 3, gl.FLOAT, false, 24, offset);
    }
    this.textures.forEach((t, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
    });
    gl.uniform1i(this.uniforms.surface, 0);
    gl.uniform1i(this.uniforms.provinces, 1);
    gl.uniform1i(this.uniforms.palette, 2);
    gl.uniform2fv(this.uniforms.center, mercator(this.view.lon, this.view.lat));
    gl.uniform2fv(this.uniforms.extent, this.extent);
    gl.uniform2fv(this.uniforms.tilt, this.tilt);
    gl.uniform1f(this.uniforms.clock, time);
    gl.uniform1f(this.uniforms.political, political ? 1 : 0);
    gl.uniform1f(this.uniforms.selected, selected == null ? -1 : selected + 1);
    gl.uniform1f(this.uniforms.texel, 0.7 / this.data.provinceSize);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    this.textures.forEach((t) => gl.deleteTexture(t));
    gl.deleteBuffer(this.vertexBuffer);
    gl.deleteBuffer(this.indexBuffer);
    gl.deleteProgram(this.program);
  }
}

/** Water is capped at 30fps. Reduced motion/background scenes render on demand. */
export function shouldRenderFrame(
  now: number,
  last: number,
  active: boolean,
  reducedMotion: boolean,
  dirty: boolean,
) {
  return active && (dirty || (!reducedMotion && now - last >= 1000 / 30));
}
export const renderScale = (deviceRatio: number) => clamp(deviceRatio, 1, 1.5);
