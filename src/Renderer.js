'use strict';

const RANDOM_FN = `
const uint s = 0x9E3779B9u;
const uint k1 = 0xA341316Cu;
const uint k2 = 0xC8013EA4u;
const uint k3 = 0xAD90777Du;
const uint k4 = 0x7E95761Eu;

// thanks, https://gaim.umbc.edu/2010/07/01/gpu-random-numbers/
vec2 random(uvec2 seed) {
  uvec2 v = seed;
  ${`
  v.x += ((v.y << 4u) + k1) ^ (v.y + s) ^ ((v.y >> 5u) + k2);
  v.y += ((v.x << 4u) + k3) ^ (v.x + s) ^ ((v.x >> 5u) + k4);
  `.repeat(3)}
  return vec2(v & 0xFFFFu) / 65535.0;
}`;

const GRID_VERT = `#version 300 es
precision mediump float;

uniform vec2 fov;
uniform vec3 origin;
in vec2 v;
out vec2 p;

void main(void) {
  p = v * fov;
  gl_Position = vec4(v, 0.0, 1.0);
}`;

const GRID_FRAG = `#version 300 es
precision mediump float;

uniform vec3 origin;
uniform mat3 view;
uniform float linew;
in vec2 p;
out vec4 col;

void main(void) {
  float inclination = length(p);
  vec3 ray = view * -vec3(sin(inclination) * p / inclination, cos(inclination));

  if (ray.z < 0.0) {
    float d = origin.z / ray.z;
    vec2 uv = origin.xy - d * ray.xy;
    vec2 lim = abs(mod(uv, 1.0) - 0.5);
    vec2 thresh = vec2(
      smoothstep(0.5 - fwidth(uv.x) * linew, 0.5, lim.x),
      smoothstep(0.5 - fwidth(uv.y) * linew, 0.5, lim.y)
    );
    col = mix(
      vec4(0.00, 0.20, 0.05, 1.0),
      vec4(0.00, 0.05, 0.02, 1.0),
      (1.0 - max(thresh.x, thresh.y)) * pow(0.95, -d)
    );
  } else {
    col = vec4(0.00, 0.07, 0.20, 1.0);
  }
}`;

const RENDER_VERT = `#version 300 es
precision mediump float;

uniform vec2 fov;
in vec2 v;
out vec2 p;

void main(void) {
  p = v * fov;
  gl_Position = vec4(v, 0.0, 1.0);
}`;

const RENDER_FRAG = `#version 300 es
precision mediump float;

uniform sampler2D stencil;
uniform sampler2D shadow;
uniform vec3 origin;
uniform mat3 view;
uniform int steps;
uniform float ifog;
uniform vec3 light;
uniform vec3 lightcol;
uniform float dustRef;
uniform float idustOpac;
uniform float stencilDepth;
uniform uint randomSeed;
uniform vec2 lbound;
uniform vec2 ubound;
uniform float A;
uniform bool inside;

in vec2 p;
out vec4 col;

const float INF = 1.0 / 0.0;
const float DEPTH_LIMIT = 10.0;

${RANDOM_FN}

bool checkX(float B, vec3 ray, float t) {
  float m = A - B * t;
  float s = origin.x + ray.x * t - light.x;
  return (s > lbound.x * m && s < ubound.x * m);
}

bool checkY(float B, vec3 ray, float t) {
  float m = A - B * t;
  float s = origin.y + ray.y * t - light.y;
  return (s > lbound.y * m && s < ubound.y * m);
}

void main(void) {
  float inclination = length(p);
  vec3 ray = view * -vec3(sin(inclination) * p / inclination, cos(inclination));
  float B = ray.z / light.z;

  vec3 surface;
  float tmax;
  if (ray.z < 0.0) {
    surface = texture(stencil, (origin.xy - origin.z * ray.xy / ray.z) * 0.5 + 0.5).xyz;
    tmax = -origin.z / ray.z;
  } else {
    surface = vec3(0.0);
    tmax = DEPTH_LIMIT;
  }

  vec2 liml = (A * lbound + light.xy - origin.xy) / (B * lbound + ray.xy);
  vec2 limu = (A * ubound + light.xy - origin.xy) / (B * ubound + ray.xy);

  float tmin;
  if (inside) {
    tmin = 0.0;
  } else {
    tmin = INF;
    if (liml.x > 0.0 && checkY(B, ray, liml.x)) { tmin = liml.x; }
    if (liml.y > 0.0 && liml.y < tmin && checkX(B, ray, liml.y)) { tmin = liml.y; }
    if (limu.x > 0.0 && limu.x < tmin && checkY(B, ray, limu.x)) { tmin = limu.x; }
    if (limu.y > 0.0 && limu.y < tmin && checkX(B, ray, limu.y)) { tmin = limu.y; }
  }
  if (surface == vec3(0.0)) {
    if (liml.x > tmin && liml.x < tmax) { tmax = liml.x; }
    if (liml.y > tmin && liml.y < tmax) { tmax = liml.y; }
    if (limu.x > tmin && limu.x < tmax) { tmax = limu.x; }
    if (limu.y > tmin && limu.y < tmax) { tmax = limu.y; }
  } else {
    tmax += min(stencilDepth / ray.z, -stencilDepth * 3.0);
  }

  vec3 accum = vec3(0.0);
  float remaining = pow(ifog, tmin);

  if (tmax > tmin) {
    float step = (tmax - tmin) / float(steps);
    float ifogstep = pow(ifog, step);
    float dither = random(uvec2(gl_FragCoord.x * 10000.0 + gl_FragCoord.y, randomSeed)).x;
    float t = tmin + step * dither;
    for (int i = 0; i < steps; ++i) {
      float m = 1.0 / (A - B * t);
      vec3 pos = origin + ray * t;
      vec3 P = pos - light;
      vec2 s = (P.xy * m + light.xy) * 0.5 + 0.5;
      vec3 v = pos.z > 0.0 ? texture(stencil, s).xyz : surface;
      if (v != vec3(0.0)) {
        vec3 intensity = (
          v // light through stencil
          * (pos.z > 0.0 ? pow(ifog, length(P) * (1.0 + light.z / P.z)) * m * m : 1.0) // attenuation due to fog on path of light & dispersal of light
          * (1.0 - ifogstep) // integral of fog over distance travelled by ray this step
          * remaining // integral of fog over ray so far
        );
        vec2 d = texture(shadow, s).xy;
        if (pos.z < d.x) {
          accum += intensity;
        } else if (pos.z < d.y) {
          accum += dustRef * intensity;
          remaining *= pow(idustOpac, step);
        }
      }
      remaining *= ifogstep;
      t += step;
    }
  }

  col = vec4((accum + surface * remaining) * lightcol, 1.0);
}`;

const DUST_UPDATE_VERT = `#version 300 es
precision mediump float;

uniform int reset;
uniform vec4 lbound;
uniform vec4 ubound;

in vec4 oldPos;
in vec4 oldVel;
out vec4 newPos;
out vec4 newVel;

${RANDOM_FN}

void main(void) {
  if (reset != 0) {
    vec2 r1 = random(uvec2(0x12345678u, gl_VertexID));
    vec2 r2 = random(uvec2(0x87654321u, gl_VertexID));
    vec2 r3 = random(uvec2(0x18273645u, gl_VertexID));
    vec2 r4 = random(uvec2(0x54637281u, gl_VertexID));
    newPos = vec4(r1, r2) * (ubound - lbound) + lbound;
    newVel = (vec4(r3, r4) - 0.5) * 0.01;
  } else {
    newPos = oldPos + vec4(oldVel.xyz, 0.0);
    newVel = oldVel;
  }
}`;

const NOOP_FRAG = `#version 300 es
precision mediump float;
void main(void) { discard; }`;

const SHADOW_VERT = `#version 300 es
precision mediump float;

uniform vec3 light;
uniform float lerp;

in vec4 vNext;
in vec4 vPrev;

out vec2 uv;
flat out float z;
flat out float r;

void main(void) {
  uv = vec2(gl_VertexID / 2, gl_VertexID % 2) * 2.0 - 1.0;
  vec4 v = mix(vPrev, vNext, lerp);
  z = v.z;
  r = v.w;
  gl_Position = vec4(light.xy * v.z - (v.xy + uv * v.w) * light.z, 0.0, v.z - light.z);
}`;

const SHADOW_FRAG = `#version 300 es
precision mediump float;

in vec2 uv;
flat in float z;
flat in float r;

out vec4 col;

void main(void) {
  float d2 = dot(uv, uv);
  if (d2 > 1.0) {
    discard;
  }
  float o = sqrt(1.0 - d2) * r;
  col = vec4(z - o, z + o, 0.0, 0.0);
}`;

const QUAD_ATTRIB_LOCATION = 0;

class Renderer {
  constructor(canvas, { width, height, displayScale, shadowMapSize, dust, stencilRenderer }) {
    this.ctx = canvas.getContext('webgl2', {
      // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#avoid_alphafalse_which_can_be_expensive
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    this._resizeDisplay(width * displayScale, height * displayScale);

    this.width = width;
    this.height = height;
    this.displayScale = displayScale;
    this.dust = dust;
    this.shadowMapSize = shadowMapSize;
    this.stencilRenderer = stencilRenderer;
    this.shadowMaps = [];
    this.latestConfig = {};

    this.stencilInfo = null;
    this.stencil = createEmptyTexture(this.ctx, {
      wrap: GL.CLAMP_TO_EDGE,
      mag: GL.LINEAR,
      min: GL.LINEAR,
      format: GL.RGBA8, // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#some_formats_e.g._rgb_may_be_emulated
      width: this.stencilRenderer.size,
      height: this.stencilRenderer.size,
    });

    this.dustUpdateProgram = new ProgramBuilder(this.ctx)
      .withVertexShader(DUST_UPDATE_VERT)
      .withFragmentShader(NOOP_FRAG)
      .transformFeedbackVaryings(['newPos', 'newVel'], GL.INTERLEAVED_ATTRIBS)
      .withUniform4f('lbound')
      .withUniform4f('ubound')
      .withUniform1i('reset')
      .withAttribute('oldPos')
      .withAttribute('oldVel')
      .link();

    this.shadowProgram = new ProgramBuilder(this.ctx)
      .withVertexShader(SHADOW_VERT)
      .withFragmentShader(SHADOW_FRAG)
      .withUniform3f('light')
      .withUniform1f('lerp')
      .withAttribute('vNext')
      .withAttribute('vPrev')
      .link();

    [this.dust1, this.dust2] = [1, 2].map(() => {
      const vertexArrayUpdate = this.ctx.createVertexArray();
      this.ctx.bindVertexArray(vertexArrayUpdate);
      const buffer = this.ctx.createBuffer();
      this.ctx.bindBuffer(GL.ARRAY_BUFFER, buffer);
      this.ctx.bufferData(GL.ARRAY_BUFFER, dust.count * 8 * Float32Array.BYTES_PER_ELEMENT, GL.DYNAMIC_DRAW);
      this.dustUpdateProgram
        .vertexAttribPointer('oldPos', 4, GL.FLOAT, false, 8 * Float32Array.BYTES_PER_ELEMENT, 0 * Float32Array.BYTES_PER_ELEMENT)
        .vertexAttribPointer('oldVel', 4, GL.FLOAT, false, 8 * Float32Array.BYTES_PER_ELEMENT, 4 * Float32Array.BYTES_PER_ELEMENT);

      const vertexArrayRender = this.ctx.createVertexArray();
      return { buffer, vertexArrayUpdate, vertexArrayRender };
    });

    for (const [me, other] of [[this.dust1, this.dust2], [this.dust2, this.dust1]]) {
      this.ctx.bindVertexArray(me.vertexArrayRender);
      this.ctx.bindBuffer(GL.ARRAY_BUFFER, me.buffer);
      this.shadowProgram.vertexAttribPointer('vNext', 4, GL.FLOAT, false, 8 * Float32Array.BYTES_PER_ELEMENT, 0 * Float32Array.BYTES_PER_ELEMENT, { divisor: 4 });
      this.ctx.bindBuffer(GL.ARRAY_BUFFER, other.buffer);
      this.shadowProgram.vertexAttribPointer('vPrev', 4, GL.FLOAT, false, 8 * Float32Array.BYTES_PER_ELEMENT, 0 * Float32Array.BYTES_PER_ELEMENT, { divisor: 4 });
    }

    this.gridProgram = new ProgramBuilder(this.ctx)
      .withVertexShader(GRID_VERT)
      .withFragmentShader(GRID_FRAG)
      .bindAttribLocation(QUAD_ATTRIB_LOCATION, 'v')
      .withUniform2f('fov')
      .withUniform3f('origin')
      .withUniformMatrix3fv('view')
      .withUniform1f('linew')
      .link();

    this.renderProgram = new ProgramBuilder(this.ctx)
      .withVertexShader(RENDER_VERT)
      .withFragmentShader(RENDER_FRAG)
      .bindAttribLocation(QUAD_ATTRIB_LOCATION, 'v')
      .withUniform1i('stencil')
      .withUniform1i('shadow')
      .withUniform2f('fov')
      .withUniform3f('origin')
      .withUniformMatrix3fv('view')
      .withUniform2f('lbound')
      .withUniform2f('ubound')
      .withUniform1f('A')
      .withUniform1i('inside')
      .withUniform1f('dustRef')
      .withUniform1f('idustOpac')
      .withUniform1f('stencilDepth')
      .withUniform3f('light')
      .withUniform1i('steps')
      .withUniform1f('ifog')
      .withUniform3f('lightcol')
      .withUniform1ui('randomSeed')
      .link();

    this.quadVertexArray = this.ctx.createVertexArray();
    this.ctx.bindVertexArray(this.quadVertexArray);
    const quadBuffer = this.ctx.createBuffer();
    this.ctx.bindBuffer(GL.ARRAY_BUFFER, quadBuffer);
    this.ctx.bufferData(GL.ARRAY_BUFFER, new Float32Array([
      -1.0, -1.0,
      1.0, -1.0,
      -1.0, 1.0,
      1.0, 1.0,
    ]), GL.STATIC_DRAW);
    this.ctx.enableVertexAttribArray(QUAD_ATTRIB_LOCATION);
    this.ctx.vertexAttribPointer(QUAD_ATTRIB_LOCATION, 2, GL.FLOAT, false, 0, 0);
  }

  _stepDust(from, to) {
    let curFrame = Math.floor(from / this.dust.updateInterval);
    const targetDustFrame = Math.floor(to / this.dust.updateInterval);
    let reset = false;
    if (targetDustFrame < curFrame) {
      // reset
      reset = true;
      curFrame = -2; // calculate initial positions then next positions
    }
    if (targetDustFrame > curFrame) {
      // advance
      this.ctx.enable(GL.RASTERIZER_DISCARD);
      this.dustUpdateProgram.use({
        lbound: [-this.dust.extentx, -this.dust.extenty, this.dust.minz, this.dust.minsize],
        ubound: [this.dust.extentx, this.dust.extenty, this.dust.maxz, this.dust.maxsize],
      });
      for (; curFrame < targetDustFrame; ++curFrame) {
        this.dustUpdateProgram.set({ reset });
        reset = false;
        this.ctx.bindVertexArray(this.dust1.vertexArrayUpdate);
        this.ctx.bindBufferBase(GL.TRANSFORM_FEEDBACK_BUFFER, 0, this.dust2.buffer);
        // TODO: smarter dust update (model air as incompressible fluid with boundary at stencil and upward force through gaps)

        this.ctx.beginTransformFeedback(GL.POINTS);
        this.ctx.drawArrays(GL.POINTS, 0, this.dust.count);
        this.ctx.endTransformFeedback();

        [this.dust1, this.dust2] = [this.dust2, this.dust1];
      }
      this.ctx.disable(GL.RASTERIZER_DISCARD);
      this.ctx.bindBufferBase(GL.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    }
    return (to / this.dust.updateInterval) % 1;
  }

  _createShadowMap() {
    const texture = createEmptyTexture(this.ctx, {
      wrap: GL.REPEAT,
      mag: GL.NEAREST,
      min: GL.NEAREST,
      format: getFloatBufferFormats(this.ctx).rg,
      width: this.shadowMapSize,
      height: this.shadowMapSize,
    });
    const buffer = this.ctx.createFramebuffer();
    this.ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, buffer);
    this.ctx.framebufferTexture2D(
      GL.DRAW_FRAMEBUFFER,
      GL.COLOR_ATTACHMENT0,
      GL.TEXTURE_2D,
      texture,
      0
    );

    return { buffer, texture };
  }

  _updateShadowMap(shadowMap, lightPos, dustLerp) {
    this.ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, shadowMap.buffer);
    this.ctx.viewport(0, 0, this.shadowMapSize, this.shadowMapSize);
    this.ctx.clearColor(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 0, 0);
    this.ctx.clear(GL.COLOR_BUFFER_BIT);
    this.ctx.blendEquation(GL.MIN);
    this.ctx.blendFunc(GL.ONE, GL.ONE);
    this.ctx.enable(GL.BLEND);

    this.shadowProgram.use({
      light: [lightPos.x, lightPos.y, lightPos.z],
      lerp: dustLerp,
    });
    this.ctx.bindVertexArray(this.dust1.vertexArrayRender);
    this.ctx.drawArraysInstanced(GL.TRIANGLE_STRIP, 0, 4, this.dust.count);

    this.ctx.disable(GL.BLEND);
  }

  render(config) {
    if (!config) {
      config = this.latestConfig;
    }
    if (deepEqual(config, this.latestConfig)) {
      return;
    }

    const dustChanged = (config.time !== this.latestConfig.time);
    const dustLerp = this._stepDust(
      this.latestConfig.time ?? Number.POSITIVE_INFINITY,
      config.time,
    );

    if (!deepEqual(config.stencil, this.latestConfig.stencil)) {
      this.stencilInfo = this.stencilRenderer.render(config.stencil);
      this.ctx.bindTexture(GL.TEXTURE_2D, this.stencil);
      this.ctx.texSubImage2D(
        GL.TEXTURE_2D,
        0,
        0,
        0,
        this.stencilRenderer.size,
        this.stencilRenderer.size,
        GL.RGBA,
        GL.UNSIGNED_BYTE,
        this.stencilInfo.canvas.transferToImageBitmap(),
      );
    }
    for (let i = 0; i < config.lights.length; ++i) {
      const light = config.lights[i];
      if (
        !this.shadowMaps[i] ||
        dustChanged ||
        !deepEqual(light.pos, this.latestConfig.lights?.[i]?.pos)
      ) {
        if (!this.shadowMaps[i]) {
          this.shadowMaps[i] = this._createShadowMap();
        }
        this._updateShadowMap(this.shadowMaps[i], light.pos, dustLerp);
      }
    }

    const eyeSep = config.view.eyeSeparation;
    const stereoscopic = Boolean(eyeSep);

    this.ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, null);

    if (!config.grid) {
      this.ctx.clearColor(0, 0, 0, 1);
      this.ctx.clear(GL.COLOR_BUFFER_BIT);
    }

    const w = (this.width * (stereoscopic ? 2 : 1) * config.resolution)|0;
    const h = (this.height * config.resolution)|0;
    if (this.ctx.canvas.width !== w || this.ctx.canvas.height !== h) {
      this.ctx.canvas.width = w;
      this.ctx.canvas.height = h;
      this._resizeDisplay(
        this.width * (stereoscopic ? 2 : 1) * this.displayScale,
        this.height * this.displayScale,
      );
    }

    if (stereoscopic) {
      this.ctx.viewport(0, 0, w / 2, h);
      this._renderEye(config, -eyeSep * 0.5);
      this.ctx.viewport(w / 2, 0, w / 2, h);
      this._renderEye(config, eyeSep * 0.5);
    } else {
      this.ctx.viewport(0, 0, w, h);
      this._renderEye(config, 0);
    }

    this.ctx.flush();

    this.latestConfig = config;
  }

  _renderEye(config, eyeShift) {
    let view = makeViewMatrix(config.view.camera, config.view.focus, config.view.up);
    if (eyeShift) {
      view = makeViewMatrix(
        {
          x: config.view.camera.x + view[0] * eyeShift,
          y: config.view.camera.y + view[1] * eyeShift,
          z: config.view.camera.z + view[2] * eyeShift,
        },
        config.view.focus,
        {
          x: view[4],
          y: view[5],
          z: view[6],
        },
      );
    }
    const origin = { x: view[12], y: view[13], z: view[14] };
    const aspect = this.height / this.width;
    const fovx = (config.view.fovx ?? (config.view.fovy / aspect)) * 0.5;
    const fovy = (config.view.fovy ?? (fovx * aspect)) * -0.5;

    this.ctx.blendEquation(GL.FUNC_ADD);
    this.ctx.blendFunc(GL.ONE, GL.ONE);
    this.ctx.disable(GL.BLEND);

    this.ctx.bindVertexArray(this.quadVertexArray);

    if (config.grid) {
      this.gridProgram.use({
        fov: [fovx, fovy],
        view: [false, mat4xyz(view)],
        origin: [origin.x, origin.y, origin.z],
        linew: config.resolution * 3,
      });
      this.ctx.drawArrays(GL.TRIANGLE_STRIP, 0, 4);
    }

    if (!config.lights.length) {
      return;
    }

    this.ctx.enable(GL.BLEND);
    this.renderProgram.use({
      fov: [fovx, fovy],
      stencilDepth: Math.min(this.dust.minz, 0),
      steps: config.lightQuality,
      ifog: 1 - config.fog,
      view: [false, mat4xyz(view)],
      origin: [origin.x, origin.y, origin.z],
      dustRef: config.dust.reflectivity,
      idustOpac: Math.pow(1 - config.dust.opacity, 30),
      stencil: { index: 0, texture: this.stencil },
    });

    for (let i = 0; i < config.lights.length; ++i) {
      const { pos, col } = config.lights[i];
      const A = 1 - origin.z / pos.z;
      const lboundx = this.stencilInfo.minx - pos.x;
      const lboundy = this.stencilInfo.miny - pos.y;
      const uboundx = this.stencilInfo.maxx - pos.x;
      const uboundy = this.stencilInfo.maxy - pos.y;
      const sx = origin.x - pos.x;
      const sy = origin.y - pos.y;
      this.renderProgram.set({
        light: [pos.x, pos.y, pos.z],
        lightcol: [col.r, col.g, col.b],
        lbound: [lboundx, lboundy],
        ubound: [uboundx, uboundy],
        A: A,
        inside: (
          sx > lboundx * A && sx < uboundx * A &&
          sy > lboundy * A && sy < uboundy * A
        ),
        randomSeed: (config.time * 977 + i)|0,
        shadow: { index: 1, texture: this.shadowMaps[i].texture },
      });
      this.ctx.drawArrays(GL.TRIANGLE_STRIP, 0, 4);
    }
    this.ctx.disable(GL.BLEND);
  }

  _resizeDisplay(width, height) {
    this.ctx.canvas.style.width = `${width}px`;
    this.ctx.canvas.style.height = `${height}px`;
  }

  getImage() {
    return this.ctx.canvas.toDataURL('image/png');
  }
}
