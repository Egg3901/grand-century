import { iterateScenery, type SceneryProvince } from "./terrainScenery";
import {
  clamp,
  geographic,
  mercator,
  MESH_SEGMENTS,
  HIGH_MESH_SEGMENTS,
  type TerrainQuality,
  normalizeView,
  provinceAt,
  terrainHeight,
  type TerrainData,
  type View,
} from "./terrainData";

const vertex = `
attribute vec3 position;
attribute vec3 normal;
attribute vec3 color;
uniform vec2 center;
uniform vec2 extent;
uniform vec2 tilt;
uniform vec2 meshCenter;
uniform vec2 meshExtent;
uniform sampler2D heightMap;
uniform float heightTexel;
uniform float scenery;
float metersAt(vec2 at) {
  vec2 bytes=texture2D(heightMap,at).ra;
  return dot(floor(bytes*255.0+.5),vec2(1.0,256.0));
}
float heightAt(vec2 at) {
  vec2 pixel=at/heightTexel-.5;
  vec2 base=(floor(pixel)+.5)*heightTexel;
  vec2 f=fract(pixel);
  return mix(mix(metersAt(base),metersAt(base+vec2(heightTexel,0)),f.x),
    mix(metersAt(base+vec2(0,heightTexel)),metersAt(base+vec2(heightTexel)),f.x),f.y);
}
varying vec2 uv;
varying vec3 n;
varying vec3 tint;
void main() {
  vec3 world=position;
  if(scenery<.5) {
    world.xy=meshCenter+position.xy*meshExtent;
    float t=3.14159265*(1.0-2.0*world.y);
    float cosLatitude=2.0/(exp(t)+exp(-t));
    world.z=heightAt(world.xy)*12.0/(40075016.686*max(.12,cosLatitude));
  }
  float north = center.y - world.y;
  gl_Position = vec4((world.x-center.x)/extent.x,
    (north*tilt.x+world.z*tilt.y)/extent.y,
    (north*tilt.y-world.z*tilt.x)/(extent.y*6.0),1.0);
  uv = world.xy; n = normal; tint = color;
}`;
const fragment = `
precision highp float;
uniform sampler2D surface;
uniform sampler2D provinces;
uniform sampler2D palette;
uniform sampler2D normalMap;
uniform float clock;
uniform float political;
uniform float selected;
uniform float texel;
uniform float provinceTexel;
uniform float detail;
uniform float scenery;
varying vec2 uv;
varying vec3 n;
varying vec3 tint;
float idAt(vec2 p) { vec2 c=texture2D(provinces,p).ra; return floor(c.x*255.0+.5)+floor(c.y*255.0+.5)*256.0; }
float hash(vec2 p) {
  vec2 q=fract(p*vec2(.1031,.11369));
  q+=dot(q,q.yx+19.19);
  return fract(q.x*q.y*95.43);
}
float noise(vec2 p) {
  vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
void main() {
  vec3 sun=normalize(vec3(-.4,.5,.77));
  if(scenery>.5) {
    gl_FragColor=vec4(tint*(.54+.62*max(0.0,dot(normalize(n),sun))),1.0);return;
  }
  if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0) discard;
  vec4 ground=texture2D(surface,uv);
  float id=idAt(uv);
  float coverage=smoothstep(.35,.65,ground.a);
  vec3 water=vec3(0.0);
  if(coverage<.999) {
    // Crossed travelling swells, with smaller capillary waves appearing on zoom.
    vec2 p=uv*12000.0;
    p+=vec2(noise(p*.08),noise(p*.065+vec2(31.0,17.0)))*10.0;
    float swell=sin(dot(p,vec2(.78,.63))+clock*1.35);
    float cross=sin(dot(p,vec2(-.56,1.12))-clock*1.8+swell*.6);
    float fine=sin(dot(p,vec2(3.3,-2.1))+clock*3.1+cross);
    vec3 wn=normalize(vec3(swell*.27+cross*.14,cos(dot(p,vec2(.78,.63))+clock*1.35)*.20+fine*.055*detail,1.0));
    vec3 eye=normalize(vec3(0.0,-.707,.707));
    float fresnel=.035+.965*pow(1.0-max(0.0,dot(wn,eye)),5.0);
    float glint=pow(max(0.0,dot(wn,normalize(sun+eye))),128.0);
    float coast=texture2D(normalMap,uv).a;
    float shelf=smoothstep(.02,.95,coast);
    vec3 sea=mix(vec3(.025,.13,.24),vec3(.055,.43,.48),shelf);
    sea=mix(sea,vec3(.38,.57,.68),fresnel*.7);
    sea+=vec3(.65,.73,.70)*glint*.24*(.3+.7*noise(p*.27))+(swell+cross*.5)*.011;
    // Moving surf bands follow the authored coast, not a separate geographic outline.
    float breaker=pow(max(0.0,sin(coast*18.0-clock*2.4+cross*1.7)),10.0);
    float shore=smoothstep(.77,.99,coast);
    sea=mix(sea,vec3(.71,.83,.79),shore*breaker*(.65+.35*fine)*.52);
    water=sea;
    if(coverage<.001) { gl_FragColor=vec4(water,1.0);return; }
  }
  if(id<.5) id=max(idAt(uv+vec2(provinceTexel*2.0,0.0)),max(idAt(uv-vec2(provinceTexel*2.0,0.0)),max(idAt(uv+vec2(0.0,provinceTexel*2.0)),idAt(uv-vec2(0.0,provinceTexel*2.0)))));
  vec2 oct=texture2D(normalMap,uv).ra*2.0-1.0;
  vec3 normal=normalize(vec3(oct,1.0-abs(oct.x)-abs(oct.y)));
  float grain=noise(uv*18000.0);
  float broad=grain;
  float vegetation=smoothstep(.01,.10,ground.g-ground.r)*step(ground.b,ground.g);
  // Fine canopy and exposed-rock variation is material detail, not invented mountain height.
  vec3 material=ground.rgb*(.94+.10*broad+detail*(grain-.5)*(.025+vegetation*.06));
  float slope=1.0-normal.z;
  float light=.32+.88*max(0.0,dot(normal,sun));
  vec3 ambient=vec3(.83,.92,1.0);
  vec3 land=material*mix(ambient,vec3(1.0,.97,.89),max(0.0,dot(normal,sun)))*light;
  land*=1.0-slope*.13;
  vec3 pigment=texture2D(palette,vec2((id-.5)/1024.0,.5)).rgb;
  land=mix(land,land*.68+pigment*light*.32,political*step(.5,id));
  float border=step(.5,abs(id-idAt(uv+vec2(texel,0.0))))+step(.5,abs(id-idAt(uv+vec2(0.0,texel))));
  land=mix(land,vec3(.20,.23,.16),min(1.0,border)*mix(.16,.50,political));
  if(abs(id-selected)<.1) land=mix(land,vec3(.96,.79,.38),.13+min(1.0,border)*.62);
  gl_FragColor=vec4(mix(water,land,coverage),1.0);
}
`;

/** Native RAF uses device uptime. Subtract in JS before conversion to a GPU float. */
export class TerrainAnimationClock {
  private origin: number | null = null;
  sample(seconds: number): number {
    // Zero is the explicit Reduced Motion frame, not an animation epoch.
    if (seconds <= 0) return 0;
    this.origin ??= seconds;
    return Math.max(0, seconds - this.origin);
  }
}

/** Bounded terrain and scenery batches, no scene-graph allocations per frame. */
export class TerrainRenderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private vertexBuffer: WebGLBuffer;
  private indexBuffer: WebGLBuffer;
  private textures: WebGLTexture[] = [];
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private meshKey = "";
  private meshCenter: [number, number] = [0, 0];
  private meshExtent: [number, number] = [1, 1];
  private attributes: Record<string, number> = {};
  private sceneryWork: Generator<void, Float32Array> | null = null;
  private sceneryBounds: {
    x: number;
    y: number;
    ex: number;
    ey: number;
    zoom: number;
  } | null = null;
  private lastCameraChange = 0;
  private sceneryTimer: ReturnType<typeof setTimeout> | null = null;
  private readyScenery: Float32Array | null = null;
  private sceneryFailure: unknown = null;
  private paletteKey = "";
  private count = 0;
  private sceneryCount = 0;
  private sceneryBuffer: WebGLBuffer | null = null;
  private sceneryProvinces: readonly SceneryProvince[] = [];
  private readonly segments: number;
  private width = 1;
  private height = 1;
  private extent: [number, number] = [0.1, 0.1];
  private disposed = false;
  private animationClock = new TerrainAnimationClock();
  private view: View = { lon: 8, lat: 40, zoom: 3 };
  private readonly tilt: [number, number] = [
    Math.cos(Math.PI / 4),
    Math.sin(Math.PI / 4),
  ];
  readonly data: TerrainData;
  readonly quality: TerrainQuality;
  constructor(
    gl: WebGLRenderingContext,
    data: TerrainData,
    quality: TerrainQuality = "balanced",
  ) {
    this.quality = quality;
    this.segments = quality === "high" ? HIGH_MESH_SEGMENTS : MESH_SEGMENTS;
    this.gl = gl;
    this.data = data;
    if (gl.getParameter(gl.MAX_TEXTURE_SIZE) < data.provinceSize)
      throw new Error("This device requires the 2D map");
    if (gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) < 1)
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
      this.sceneryBuffer = gl.createBuffer();
      if (!this.sceneryBuffer) throw new Error("Unable to allocate scenery");
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
        "provinceTexel",
        "normalMap",
        "detail",
        "scenery",
        "heightMap",
        "heightTexel",
        "meshCenter",
        "meshExtent",
      ])
        this.uniforms[name] = gl.getUniformLocation(program, name);
      for (const name of ["position", "normal", "color"])
        this.attributes[name] = gl.getAttribLocation(program, name);
      // Packed low/high bytes use luminance and alpha, avoiding a 64 MiB RGBA copy.
      const ids = new Uint8Array(
        data.provinces.buffer,
        data.provinces.byteOffset,
        data.provinces.byteLength,
      );
      this.texture(data.size, data.size, data.surface, true);
      this.texture(
        data.provinceSize,
        data.provinceSize,
        ids,
        false,
        gl.LUMINANCE_ALPHA,
      );
      this.texture(1024, 1, new Uint8Array(4096).fill(180), false);
      this.texture(
        data.size,
        data.size,
        data.normals,
        true,
        gl.LUMINANCE_ALPHA,
      );
      this.texture(
        data.size,
        data.size,
        new Uint8Array(
          data.heights.buffer,
          data.heights.byteOffset,
          data.heights.byteLength,
        ),
        false,
        gl.LUMINANCE_ALPHA,
      );
      // Fixed grid: the vertex shader samples elevation. Camera gestures only
      // change uniforms, never generate 65,000 vertices on the JS thread.
      const vertices = new Float32Array((this.segments + 1) ** 2 * 6);
      let cursor = 0;
      for (let y = 0; y <= this.segments; y++)
        for (let x = 0; x <= this.segments; x++) {
          vertices[cursor] = (x / this.segments) * 2 - 1;
          vertices[cursor + 1] = (y / this.segments) * 2 - 1;
          vertices[cursor + 5] = 1;
          cursor += 6;
        }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      const indices = new Uint16Array(this.segments * this.segments * 6);
      let k = 0;
      for (let y = 0; y < this.segments; y++)
        for (let x = 0; x < this.segments; x++) {
          const a = y * (this.segments + 1) + x,
            b = a + 1,
            c = a + this.segments + 1,
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
  private texture(
    w: number,
    h: number,
    pixels: Uint8Array,
    linear: boolean,
    format: number = this.gl.RGBA,
  ) {
    const gl = this.gl,
      texture = gl.createTexture();
    if (!texture) throw new Error("Unable to allocate terrain texture");
    this.textures.push(texture);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      linear ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST,
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
      format,
      w,
      h,
      0,
      format,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    if (linear) gl.generateMipmap(gl.TEXTURE_2D);
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
    this.lastCameraChange = performance.now();
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
    this.meshCenter = [cx, cy];
    this.meshExtent = [ex, ey];
    this.sceneryWork = null;
    this.readyScenery = null;
    this.sceneryFailure = null;
    if (this.sceneryTimer !== null) clearTimeout(this.sceneryTimer);
    this.sceneryTimer = null;
    this.sceneryBounds =
      this.quality === "high" ? { x: cx, y: cy, ex, ey, zoom: level } : null;
    if (this.sceneryBounds) this.scheduleScenery(120);
  }
  get sceneryVertexCount() {
    return this.sceneryCount;
  }
  get needsFrame() {
    return this.readyScenery !== null || this.sceneryFailure !== null;
  }
  get isPreparingScenery() {
    return this.sceneryBounds !== null || this.sceneryWork !== null;
  }
  private scheduleScenery(delay: number) {
    this.sceneryTimer = setTimeout(() => {
      try {
        this.advanceScenery();
      } catch (error) {
        this.sceneryTimer = null;
        this.sceneryWork = null;
        this.sceneryBounds = null;
        this.sceneryFailure =
          error instanceof Error ? error : new Error(String(error));
      }
    }, delay);
  }
  private advanceScenery() {
    this.sceneryTimer = null;
    if (this.disposed) return;
    // CPU preparation does not depend on GPU throughput. Yield between small
    // batches and keep the previous models until the complete buffer is ready.
    const quietFor = performance.now() - this.lastCameraChange;
    if (quietFor < 120) {
      this.scheduleScenery(120 - quietFor);
      return;
    }
    if (this.sceneryBounds) {
      this.sceneryWork = iterateScenery(
        this.data,
        this.sceneryProvinces,
        this.sceneryBounds,
      );
      this.sceneryBounds = null;
    }
    const deadline = performance.now() + 2;
    for (let batches = 0; this.sceneryWork && batches < 8; batches++) {
      const next = this.sceneryWork.next();
      if (next.done) {
        this.readyScenery = next.value;
        this.sceneryWork = null;
        break;
      }
      if (performance.now() >= deadline) break;
    }
    if (this.sceneryWork) this.scheduleScenery(0);
  }
  setScenery(provinces: readonly SceneryProvince[]) {
    this.sceneryProvinces = provinces;
    this.meshKey = "";
  }
  zoomAt(px: number, py: number, delta: number): View {
    const [lon, lat] = this.unproject(px, py);
    const [x, y] = mercator(lon, lat);
    const zoom = normalizeView({
      ...this.view,
      zoom: this.view.zoom + delta,
    }).zoom;
    const span = 1 / 2 ** zoom;
    const cx =
      x - (((px / this.width) * 2 - 1) * span * this.width) / this.height / 2;
    const cy =
      y +
      (((1 - (py / this.height) * 2) * span) / 2 -
        terrainHeight(this.data, x, y) * this.tilt[1]) /
        this.tilt[0];
    const center = geographic(cx, cy);
    return normalizeView({ lon: center[0], lat: center[1], zoom });
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
    if (this.sceneryFailure) throw this.sceneryFailure;
    const gl = this.gl;
    if (this.readyScenery) {
      this.sceneryCount = this.readyScenery.length / 9;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.sceneryBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.readyScenery, gl.DYNAMIC_DRAW);
      this.readyScenery = null;
    }
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
      const at = this.attributes[name];
      gl.enableVertexAttribArray(at);
      gl.vertexAttribPointer(at, 3, gl.FLOAT, false, 24, offset);
    }
    this.textures.forEach((t, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
    });
    gl.uniform1i(this.uniforms.heightMap, 4);
    gl.uniform1f(this.uniforms.heightTexel, 1 / this.data.size);
    gl.uniform2fv(this.uniforms.meshCenter, this.meshCenter);
    gl.uniform2fv(this.uniforms.meshExtent, this.meshExtent);
    gl.uniform1i(this.uniforms.surface, 0);
    gl.uniform1i(this.uniforms.provinces, 1);
    gl.uniform1i(this.uniforms.palette, 2);
    gl.uniform1i(this.uniforms.normalMap, 3);
    gl.uniform1f(this.uniforms.detail, clamp((this.view.zoom - 2.5) / 2, 0, 1));
    gl.uniform1f(this.uniforms.scenery, 0);
    const color = this.attributes.color;
    gl.disableVertexAttribArray(color);
    gl.vertexAttrib3f(color, 1, 1, 1);
    gl.uniform2fv(this.uniforms.center, mercator(this.view.lon, this.view.lat));
    gl.uniform2fv(this.uniforms.extent, this.extent);
    gl.uniform2fv(this.uniforms.tilt, this.tilt);
    gl.uniform1f(this.uniforms.clock, this.animationClock.sample(time));
    gl.uniform1f(this.uniforms.political, political ? 1 : 0);
    gl.uniform1f(this.uniforms.selected, selected == null ? -1 : selected + 1);
    gl.uniform1f(this.uniforms.provinceTexel, 1 / this.data.provinceSize);
    gl.uniform1f(
      this.uniforms.texel,
      Math.min(
        0.7 / this.data.provinceSize,
        (1 / 2 ** this.view.zoom / this.height) * 0.8,
      ),
    );
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    if (this.sceneryCount) {
      gl.uniform1f(this.uniforms.scenery, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.sceneryBuffer);
      for (const [name, offset] of [
        ["position", 0],
        ["normal", 12],
        ["color", 24],
      ] as const) {
        const at = this.attributes[name];
        gl.enableVertexAttribArray(at);
        gl.vertexAttribPointer(at, 3, gl.FLOAT, false, 36, offset);
      }
      gl.drawArrays(gl.TRIANGLES, 0, this.sceneryCount);
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    this.textures.forEach((t) => gl.deleteTexture(t));
    gl.deleteBuffer(this.vertexBuffer);
    gl.deleteBuffer(this.indexBuffer);
    gl.deleteBuffer(this.sceneryBuffer);
    gl.deleteProgram(this.program);
    if (this.sceneryTimer !== null) clearTimeout(this.sceneryTimer);
    this.sceneryTimer = null;
    this.sceneryWork = null;
    this.sceneryBounds = null;
    this.readyScenery = null;
    this.sceneryFailure = null;
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
  return active && (dirty || (!reducedMotion && now - last >= 1000 / 30 - 1));
}
export const renderScale = (
  deviceRatio: number,
  quality: TerrainQuality = "balanced",
) => clamp(deviceRatio, 1, quality === "high" ? 2.5 : 1.5);
