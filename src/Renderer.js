'use strict';

const RENDER_VERT = `#version 300 es
precision mediump float;

uniform vec2 fov;
uniform vec2 uvregion;
in vec2 v;
out vec2 pfov;
out vec2 uv;

void main(void) {
  pfov = v * fov;
  uv = (v * 0.5 + 0.5) * uvregion;
  gl_Position = vec4(v, 0.0, 1.0);
}`;

const RENDER_FRAG_GRID = `#version 300 es
precision mediump float;

uniform vec3 origin;
uniform mat3 view;
uniform float linew;
in vec2 pfov;
out vec4 col;

void main(void) {
  float inclination = length(pfov);
  vec3 ray = view * -vec3(sin(inclination) * pfov / inclination, cos(inclination));

  if (ray.z < 0.0) {
    float d = origin.z / ray.z;
    vec2 uvs = origin.xy - d * ray.xy;
    vec2 lim = abs(mod(uvs, 1.0) - 0.5);
    vec2 thresh = vec2(
      smoothstep(0.5 - fwidth(uvs.x) * linew, 0.5, lim.x),
      smoothstep(0.5 - fwidth(uvs.y) * linew, 0.5, lim.y)
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

const RENDER_FRAG_SHAPE = `#version 300 es
precision mediump float;

uniform sampler2D stencil;
uniform vec3 origin;
uniform mat3 view;
uniform float stencilEdge;
in vec2 pfov;
out vec4 shape;

void main(void) {
  float inclination = length(pfov);
  vec3 ray = view * -vec3(sin(inclination) * pfov / inclination, cos(inclination));

  if (ray.z < 0.0) {
    vec2 uvs = (origin.xy - ray.xy * origin.z / ray.z) * 0.5 + 0.5;
    vec4 s = texture(stencil, uvs);
    float edge = clamp((s.w - 0.5) * max(stencilEdge / min(fwidth(uvs.x), fwidth(uvs.y)), 1.0) + 0.5, 0.0, 1.0);
    if (edge == 0.0) {
      shape = vec4(0.0);
    } else {
      shape = vec4(s.xyz, edge);
    }
  } else {
    shape = vec4(0.0);
  }
}`;

const RENDER_FRAG_LIGHT = `#version 300 es
precision mediump float;

uniform sampler2D shape;
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

in vec2 pfov;
in vec2 uv;
layout(location = 0) out vec4 outsideCol;
layout(location = 1) out vec4 insideCol;

const float INF = 1.0 / 0.0;
const float DEPTH_LIMIT = 10.0;

${glslRandom('random', 3)}

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
  float inclination = length(pfov);
  vec3 ray = view * -vec3(sin(inclination) * pfov / inclination, cos(inclination));

  float B = ray.z / light.z;
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
  float tmax = (ray.z < 0.0) ? -origin.z / ray.z : DEPTH_LIMIT;
  vec4 s = texture(shape, uv);
  if (s.w == 0.0) {
    if (liml.x > tmin && liml.x < tmax) { tmax = liml.x; }
    if (liml.y > tmin && liml.y < tmax) { tmax = liml.y; }
    if (limu.x > tmin && limu.x < tmax) { tmax = limu.x; }
    if (limu.y > tmin && limu.y < tmax) { tmax = limu.y; }
  } else {
    tmax += min(stencilDepth / ray.z, -stencilDepth * 3.0);
  }

  if (tmax <= tmin) {
    discard;
  }

  vec3 overAccum = vec3(0.0);
  float underAccum = 0.0;
  float remaining = pow(ifog, tmin);

  float step = (tmax - tmin) / float(steps);
  float ifogstep = pow(ifog, step);
  float dither = random(uvec2(gl_FragCoord.x * 10000.0 + gl_FragCoord.y, randomSeed)).x;
  float t = tmin + step * dither;
  for (int i = 0; i < steps; ++i) {
    float m = 1.0 / (A - B * t);
    vec3 pos = origin + ray * t;
    vec3 P = pos - light;
    vec2 s = (P.xy * m + light.xy) * 0.5 + 0.5;
    vec3 v = texture(stencil, s).xyz;
    // this optimisation comes at the cost of not showing "dark" dust
    // (an aesthetic choice which would also require always setting tmin to 0.0)
    if (pos.z <= 0.0 || v != vec3(0.0)) {
      vec2 d = texture(shadow, s).xy;
      if (pos.z < d.y) {
        float cur;
        if (pos.z < d.x) {
          cur = (1.0 - ifogstep); // integral of fog over distance travelled by ray this step
        } else {
          float iduststep = pow(idustOpac, step);
          cur = dustRef * (1.0 - iduststep);
          remaining *= iduststep;
        }
        if (pos.z > 0.0) {
          overAccum += (
            v // light through stencil
            * pow(ifog, length(P) * (1.0 + light.z / P.z)) * m * m // attenuation due to fog on path of light & dispersal of light
            * remaining // integral of fog over ray so far
            * cur
          );
        } else {
          underAccum += remaining * cur;
        }
      }
    }
    remaining *= ifogstep;
    t += step;
  }
  underAccum += remaining;

  outsideCol = vec4(overAccum * lightcol, 1.0);
  insideCol = vec4(underAccum * s.xyz * lightcol, 1.0);
}`;

const RENDER_FRAG_MIX = `#version 300 es
precision mediump float;

uniform sampler2D shape;
uniform sampler2D outside;
uniform sampler2D inside;
uniform float gamma;
uniform float saturation;
in vec2 uv;
out vec4 col;

const float kR = 0.299;
const float kB = 0.114;
const float kG = 1.0 - kR - kB;
const mat3 colmat = mat3(
  vec3(kR, -0.5 * kR / (1.0 - kB), 0.5),
  vec3(kG, -0.5 * kG / (1.0 - kB), -0.5 * kG / (1.0 - kR)),
  vec3(kB, 0.5, -0.5 * kB / (1.0 - kR))
);
const mat3 icolmat = inverse(colmat);

vec3 adjust(vec3 c) {
  vec3 yrb = colmat * c;
  yrb.x = pow(yrb.x, gamma);
  yrb.yz *= saturation;
  return clamp(icolmat * yrb, 0.0, 1.0);
}

void main(void) {
  float edge = texture(shape, uv).w;
  vec3 outsideCol = texture(outside, uv).xyz;
  vec3 insideCol = texture(inside, uv).xyz;
  col = vec4(mix(
    adjust(outsideCol),
    adjust(insideCol + outsideCol),
    edge
  ), 1.0);
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

${glslRandom('random', 3)}

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
  constructor(canvas, { width, height, shadowMapSize, dust, stencilRenderer }) {
    this.width = width;
    this.height = height;
    this.dust = dust;
    this.shadowMapSize = shadowMapSize;
    this.stencilRenderer = stencilRenderer;
    this.lastSetConfig = {};

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('webglcontextrestored', () => {
      this._init();
      this.render();
    }, { passive: true });

    this.ctx = canvas.getContext('webgl2', {
      // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#avoid_alphafalse_which_can_be_expensive
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });

    this._init();
  }

  _init() {
    this.shadowMaps = [];
    this.stencilInfo = null;
    this.renderedConfig = {};

    this.stencilRendererInstance = this.stencilRenderer(this.ctx);

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
      this.ctx.bufferData(GL.ARRAY_BUFFER, this.dust.count * 8 * Float32Array.BYTES_PER_ELEMENT, GL.DYNAMIC_DRAW);
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

    this.shapeTex = createEmptyTexture(this.ctx, {
      wrap: GL.CLAMP_TO_EDGE,
      mag: GL.NEAREST,
      min: GL.NEAREST,
      format: GL.RGBA8,
      width: this.width,
      height: this.height,
    });
    this.outsideTex = createEmptyTexture(this.ctx, {
      wrap: GL.CLAMP_TO_EDGE,
      mag: GL.NEAREST,
      min: GL.NEAREST,
      format: GL.RGBA8,
      width: this.width,
      height: this.height,
    });
    this.insideTex = createEmptyTexture(this.ctx, {
      wrap: GL.CLAMP_TO_EDGE,
      mag: GL.NEAREST,
      min: GL.NEAREST,
      format: GL.RGBA8,
      width: this.width,
      height: this.height,
    });
    this.renderShapeBuffer = this.ctx.createFramebuffer();
    this.ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, this.renderShapeBuffer);
    this.ctx.framebufferTexture2D(
      GL.DRAW_FRAMEBUFFER,
      GL.COLOR_ATTACHMENT0,
      GL.TEXTURE_2D,
      this.shapeTex,
      0
    );
    this.renderLightBuffer = this.ctx.createFramebuffer();
    this.ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, this.renderLightBuffer);
    this.ctx.framebufferTexture2D(
      GL.DRAW_FRAMEBUFFER,
      GL.COLOR_ATTACHMENT0,
      GL.TEXTURE_2D,
      this.outsideTex,
      0
    );
    this.ctx.framebufferTexture2D(
      GL.DRAW_FRAMEBUFFER,
      GL.COLOR_ATTACHMENT1,
      GL.TEXTURE_2D,
      this.insideTex,
      0
    );
    this.ctx.drawBuffers([GL.COLOR_ATTACHMENT0, GL.COLOR_ATTACHMENT1]);

    const commonVert = { type: GL.VERTEX_SHADER, src: RENDER_VERT };

    this.renderGridProgram = new ProgramBuilder(this.ctx)
      .withShader(commonVert)
      .withFragmentShader(RENDER_FRAG_GRID)
      .bindAttribLocation(QUAD_ATTRIB_LOCATION, 'v')
      .withUniform3f('origin')
      .withUniformMatrix3fv('view')
      .withUniform2f('fov')
      .withUniform1f('linew')
      .link();

    this.renderShapeProgram = new ProgramBuilder(this.ctx)
      .withShader(commonVert)
      .withFragmentShader(RENDER_FRAG_SHAPE)
      .bindAttribLocation(QUAD_ATTRIB_LOCATION, 'v')
      .withUniform1i('stencil')
      .withUniform3f('origin')
      .withUniformMatrix3fv('view')
      .withUniform2f('fov')
      .withUniform1f('stencilEdge')
      .link();

    this.renderLightProgram = new ProgramBuilder(this.ctx)
      .withShader(commonVert)
      .withFragmentShader(RENDER_FRAG_LIGHT)
      .bindAttribLocation(QUAD_ATTRIB_LOCATION, 'v')
      .withUniform1i('shape')
      .withUniform1i('stencil')
      .withUniform1i('shadow')
      .withUniform3f('origin')
      .withUniformMatrix3fv('view')
      .withUniform2f('fov')
      .withUniform2f('uvregion')
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

    this.renderMixProgram = new ProgramBuilder(this.ctx)
      .withShader(commonVert)
      .withFragmentShader(RENDER_FRAG_MIX)
      .bindAttribLocation(QUAD_ATTRIB_LOCATION, 'v')
      .withUniform2f('uvregion')
      .withUniform1i('shape')
      .withUniform1i('outside')
      .withUniform1i('inside')
      .withUniform1f('gamma')
      .withUniform1f('saturation')
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
    if (config) {
      this.lastSetConfig = config;
    } else {
      config = this.lastSetConfig;
    }
    if (deepEqual(config, this.renderedConfig)) {
      return;
    }
    if (this.ctx.isContextLost()) {
      throw new Error('cannot render: context lost');
    }

    const dustChanged = (config.time !== this.renderedConfig.time);
    const dustLerp = this._stepDust(
      this.renderedConfig.time ?? Number.POSITIVE_INFINITY,
      config.time,
    );

    if (!this.stencilInfo || !deepEqual(config.stencil, this.renderedConfig.stencil)) {
      this.stencilInfo = this.stencilRendererInstance(config.stencil);
    }
    for (let i = 0; i < config.lights.length; ++i) {
      const light = config.lights[i];
      if (
        !this.shadowMaps[i] ||
        dustChanged ||
        !deepEqual(light.pos, this.renderedConfig.lights?.[i]?.pos)
      ) {
        if (!this.shadowMaps[i]) {
          this.shadowMaps[i] = this._createShadowMap();
        }
        this._updateShadowMap(this.shadowMaps[i], light.pos, dustLerp);
      }
    }

    const eyeSep = config.view.eyeSeparation;
    const stereoscopic = Boolean(eyeSep);

    const w = (this.width * (stereoscopic ? 2 : 1) * config.resolution)|0;
    const h = (this.height * config.resolution)|0;
    if (this.ctx.canvas.width !== w || this.ctx.canvas.height !== h) {
      this.ctx.canvas.width = w;
      this.ctx.canvas.height = h;
    }

    if (stereoscopic) {
      this._renderEye(config, -eyeSep * 0.5, null, [0, 0, w / 2, h]);
      this._renderEye(config, eyeSep * 0.5, null, [w / 2, 0, w / 2, h]);
    } else {
      this._renderEye(config, 0, null, [0, 0, w, h]);
    }

    this.ctx.flush();

    this.renderedConfig = config;
  }

  _renderEye(config, eyeShift, buffer, viewport) {
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

    const w = (this.width * config.resolution)|0;
    const h = (this.height * config.resolution)|0;
    const uvregion = [w / this.width, h / this.height];
    this.ctx.bindVertexArray(this.quadVertexArray);
    this.ctx.viewport(0, 0, w, h);

    this.ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, this.renderShapeBuffer);
    this.renderShapeProgram.use({
      stencil: { index: 0, texture: this.stencilInfo.texture },
      origin: [origin.x, origin.y, origin.z],
      view: [false, mat4xyz(view)],
      fov: [fovx, fovy],
      stencilEdge: this.stencilInfo.edge,
    });
    this.ctx.drawArrays(GL.TRIANGLE_STRIP, 0, 4);

    this.ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, this.renderLightBuffer);
    this.ctx.clearColor(0, 0, 0, 0);
    this.ctx.clear(GL.COLOR_BUFFER_BIT);
    this.ctx.blendEquation(GL.FUNC_ADD);
    this.ctx.blendFunc(GL.ONE, GL.ONE);
    this.ctx.enable(GL.BLEND);
    this.renderLightProgram.use({
      shape: { index: 0, texture: this.shapeTex },
      stencil: { index: 1, texture: this.stencilInfo.texture },
      origin: [origin.x, origin.y, origin.z],
      view: [false, mat4xyz(view)],
      fov: [fovx, fovy],
      uvregion,
      dustRef: config.dust.reflectivity,
      idustOpac: Math.pow(1 - config.dust.opacity, 30),
      stencilDepth: Math.min(this.dust.minz, 0),
      steps: config.lightQuality,
      ifog: 1 - config.fog,
    });

    for (let i = 0; i < config.lights.length; ++i) {
      const { pos, col } = config.lights[i];
      const A = 1 - origin.z / pos.z;
      const lboundx = this.stencilInfo.bounds.l - pos.x;
      const lboundy = this.stencilInfo.bounds.t - pos.y;
      const uboundx = this.stencilInfo.bounds.r - pos.x;
      const uboundy = this.stencilInfo.bounds.b - pos.y;
      const sx = origin.x - pos.x;
      const sy = origin.y - pos.y;
      this.renderLightProgram.set({
        shadow: { index: 2, texture: this.shadowMaps[i].texture },
        lbound: [lboundx, lboundy],
        ubound: [uboundx, uboundy],
        A,
        inside: (
          sx > lboundx * A && sx < uboundx * A &&
          sy > lboundy * A && sy < uboundy * A
        ),
        light: [pos.x, pos.y, pos.z],
        lightcol: [col.r, col.g, col.b],
        randomSeed: (config.time * 977 + i)|0,
      });
      this.ctx.drawArrays(GL.TRIANGLE_STRIP, 0, 4);
    }
    this.ctx.disable(GL.BLEND);

    this.ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, buffer);
    this.ctx.viewport(...viewport);
    this.renderMixProgram.use({
      uvregion,
      shape: { index: 0, texture: this.shapeTex },
      outside: { index: 1, texture: this.outsideTex },
      inside: { index: 2, texture: this.insideTex },
      gamma: config.gamma,
      saturation: config.saturation,
    });
    this.ctx.drawArrays(GL.TRIANGLE_STRIP, 0, 4);

    if (config.grid) {
      this.ctx.enable(GL.BLEND);
      this.renderGridProgram.use({
        origin: [origin.x, origin.y, origin.z],
        view: [false, mat4xyz(view)],
        fov: [fovx, fovy],
        linew: config.resolution * 3,
      });
      this.ctx.drawArrays(GL.TRIANGLE_STRIP, 0, 4);
      this.ctx.disable(GL.BLEND);
    }
  }

  getImage() {
    if (this.ctx.isContextLost()) {
      throw new Error('cannot getImage: context lost');
    }
    return this.ctx.canvas.toDataURL('image/png');
  }
}
