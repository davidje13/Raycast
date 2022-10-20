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
uniform vec3 origin;
uniform vec3 light;
uniform vec2 stencilLow;
uniform vec2 stencilHigh;

in vec2 v;

out vec2 p;
flat out float A;
flat out vec2 lbound;
flat out vec2 ubound;
flat out int inside;

void main(void) {
  p = v * fov;
  lbound = stencilLow - light.xy;
  ubound = stencilHigh - light.xy;
  A = 1.0 - origin.z / light.z;
  vec2 s = origin.xy - light.xy;
  inside = (
    all(greaterThan(s, lbound.xy * A)) &&
    all(lessThan(s, ubound.xy * A))
  ) ? 1 : 0;
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
uniform float shadowMin;
uniform float shadowRange;
uniform uint randomSeed;

in vec2 p;
flat in float A;
flat in vec2 lbound;
flat in vec2 ubound;
flat in int inside;

out vec4 col;

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
  float tf;
  if (ray.z < 0.0) {
    surface = texture(stencil, (origin.xy - origin.z * ray.xy / ray.z) * 0.5 + 0.5).xyz;
    tf = ((surface == vec3(0.0) ? 0.0 : min(shadowMin, 0.0)) - origin.z) / ray.z;
  } else {
    surface = vec3(0.0);
    tf = 10.0; // max render depth when looking up through flare
  }

  vec2 liml = (A * lbound + light.xy - origin.xy) / (B * lbound + ray.xy);
  vec2 limu = (A * ubound + light.xy - origin.xy) / (B * ubound + ray.xy);

  float tmin;
  if (inside != 0) {
    tmin = 0.0;
  } else {
    tmin = tf;
    if (liml.x > 0.0 && liml.x < tmin && checkY(B, ray, liml.x)) { tmin = liml.x; }
    if (liml.y > 0.0 && liml.y < tmin && checkX(B, ray, liml.y)) { tmin = liml.y; }
    if (limu.x > 0.0 && limu.x < tmin && checkY(B, ray, limu.x)) { tmin = limu.x; }
    if (limu.y > 0.0 && limu.y < tmin && checkX(B, ray, limu.y)) { tmin = limu.y; }
  }
  float tmax = tf;
  if (liml.x > tmin && liml.x < tmax) { tmax = liml.x; }
  if (liml.y > tmin && liml.y < tmax) { tmax = liml.y; }
  if (limu.x > tmin && limu.x < tmax) { tmax = limu.x; }
  if (limu.y > tmin && limu.y < tmax) { tmax = limu.y; }

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
        float d = texture(shadow, s).x;
        if (d == 1.0 || pos.z < d * shadowRange + shadowMin) {
          accum += (
            v // light through stencil
            * (pos.z > 0.0 ? pow(ifog, length(P) * (1.0 + light.z / P.z)) * m * m : 1.0) // attenuation due to fog on path of light & dispersal of light
            * (1.0 - ifogstep) // integral of fog over distance travelled by ray this step
            * remaining // integral of fog over ray so far
          );
        }
      }
      remaining *= ifogstep;
      t += step;
    }
  }

  col = vec4((accum + surface * remaining) * lightcol, 1.0);
}`;

const DUST_VERT = `#version 300 es
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
uniform float minZ;
uniform float lerp;

in vec4 vNext;
in vec4 vPrev;

out vec2 uv;
flat out float z;
flat out float r;

void main(void) {
  uv = (vec2(ivec2(gl_VertexID / 2, gl_VertexID % 2)) - 0.5) * 2.0;
  vec4 v = mix(vPrev, vNext, lerp);
  z = v.z - minZ;
  r = v.w;
  vec3 pos = v.xyz - light;
  if (pos.z <= 0.0) {
    gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
  } else {
    float scale = -light.z / pos.z;
    gl_Position = vec4((pos.xy + uv * r) * scale + light.xy, 0.0, 1.0);
  }
}`;

const SHADOW_FRAG = `#version 300 es
precision mediump float;

uniform float depthScale;

in vec2 uv;
flat in float z;
flat in float r;

out vec4 col;

void main(void) {
  float d2 = dot(uv, uv);
  if (d2 > 1.0) {
    discard;
  }
  col = vec4(vec3((z - sqrt(1.0 - d2) * r) * depthScale), 1.0);
}`;

const QUAD_ATTRIB_LOCATION = 0;

class Renderer extends GLContext {
  constructor(canvas, { width, height, shadowMapSize, dust, stencilRenderer }) {
    super(canvas, {
      // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#avoid_alphafalse_which_can_be_expensive
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    this.resize(width, height, 1);

    this.width = width;
    this.height = height;
    this.dust = dust;
    this.shadowMapSize = shadowMapSize;
    this.stencilRenderer = stencilRenderer;
    this.maxStepsPerLight = 500;
    this.shadowMaps = [];
    this.latestConfig = {};

    this.stencilInfo = null;
    this.stencil = this.ctx.createTexture();
    this.ctx.bindTexture(GL.TEXTURE_2D, this.stencil);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.LINEAR);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.LINEAR);
    // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#use_texstorage_to_create_textures
    this.ctx.texStorage2D(
      GL.TEXTURE_2D,
      1,
      GL.RGBA8, // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#some_formats_e.g._rgb_may_be_emulated
      this.stencilRenderer.size,
      this.stencilRenderer.size,
    );

    this.dustProgram = this.linkVertexFragmentProgram(DUST_VERT, NOOP_FRAG, (p) => {
      this.ctx.transformFeedbackVaryings(p, ['newPos', 'newVel'], GL.INTERLEAVED_ATTRIBS);
    });
    this.dustProgramLBound = this.ctx.getUniformLocation(this.dustProgram, 'lbound');
    this.dustProgramUBound = this.ctx.getUniformLocation(this.dustProgram, 'ubound');
    this.dustProgramReset = this.ctx.getUniformLocation(this.dustProgram, 'reset');
    const dustProgramOldPos = this.ctx.getAttribLocation(this.dustProgram, 'oldPos');
    const dustProgramOldVel = this.ctx.getAttribLocation(this.dustProgram, 'oldVel');

    this.shadowProgram = this.linkVertexFragmentProgram(SHADOW_VERT, SHADOW_FRAG);
    this.shadowProgramLight = this.ctx.getUniformLocation(this.shadowProgram, 'light');
    this.shadowProgramMinZ = this.ctx.getUniformLocation(this.shadowProgram, 'minZ');
    this.shadowProgramDepthScale = this.ctx.getUniformLocation(this.shadowProgram, 'depthScale');
    this.shadowProgramLerp = this.ctx.getUniformLocation(this.shadowProgram, 'lerp');
    const shadowProgramVNext = this.ctx.getAttribLocation(this.shadowProgram, 'vNext');
    const shadowProgramVPrev = this.ctx.getAttribLocation(this.shadowProgram, 'vPrev');

    [this.dust1, this.dust2] = [1, 2].map(() => {
      const vertexArrayUpdate = this.ctx.createVertexArray();
      this.ctx.bindVertexArray(vertexArrayUpdate);
      const buffer = this.ctx.createBuffer();
      this.ctx.bindBuffer(GL.ARRAY_BUFFER, buffer);
      this.ctx.bufferData(GL.ARRAY_BUFFER, dust.count * 8 * Float32Array.BYTES_PER_ELEMENT, GL.DYNAMIC_DRAW);
      this.ctx.enableVertexAttribArray(dustProgramOldPos);
      this.ctx.vertexAttribPointer(dustProgramOldPos, 4, GL.FLOAT, false, 8 * Float32Array.BYTES_PER_ELEMENT, 0 * Float32Array.BYTES_PER_ELEMENT);
      this.ctx.enableVertexAttribArray(dustProgramOldVel);
      this.ctx.vertexAttribPointer(dustProgramOldVel, 4, GL.FLOAT, false, 8 * Float32Array.BYTES_PER_ELEMENT, 4 * Float32Array.BYTES_PER_ELEMENT);

      const vertexArrayRender = this.ctx.createVertexArray();
      return { buffer, vertexArrayUpdate, vertexArrayRender };
    });

    for (const [me, other] of [[this.dust1, this.dust2], [this.dust2, this.dust1]]) {
      this.ctx.bindVertexArray(me.vertexArrayRender);
      this.ctx.bindBuffer(GL.ARRAY_BUFFER, me.buffer);
      this.ctx.enableVertexAttribArray(shadowProgramVNext);
      this.ctx.vertexAttribDivisor(shadowProgramVNext, 4);
      this.ctx.vertexAttribPointer(shadowProgramVNext, 4, GL.FLOAT, false, 8 * Float32Array.BYTES_PER_ELEMENT, 0 * Float32Array.BYTES_PER_ELEMENT);
      this.ctx.bindBuffer(GL.ARRAY_BUFFER, other.buffer);
      this.ctx.enableVertexAttribArray(shadowProgramVPrev);
      this.ctx.vertexAttribDivisor(shadowProgramVPrev, 4);
      this.ctx.vertexAttribPointer(shadowProgramVPrev, 4, GL.FLOAT, false, 8 * Float32Array.BYTES_PER_ELEMENT, 0 * Float32Array.BYTES_PER_ELEMENT);
    }

    this.gridProgram = this.linkVertexFragmentProgram(GRID_VERT, GRID_FRAG, (p) => {
      this.ctx.bindAttribLocation(p, QUAD_ATTRIB_LOCATION, 'v');
    });
    this.gridProgramFOV = this.ctx.getUniformLocation(this.gridProgram, 'fov');
    this.gridProgramOrigin = this.ctx.getUniformLocation(this.gridProgram, 'origin');
    this.gridProgramView = this.ctx.getUniformLocation(this.gridProgram, 'view');
    this.gridProgramLineW = this.ctx.getUniformLocation(this.gridProgram, 'linew');

    this.program = this.linkVertexFragmentProgram(RENDER_VERT, RENDER_FRAG, (p) => {
      this.ctx.bindAttribLocation(p, QUAD_ATTRIB_LOCATION, 'v');
    });

    this.programStencil = this.ctx.getUniformLocation(this.program, 'stencil');
    this.programShadow = this.ctx.getUniformLocation(this.program, 'shadow');
    this.programFOV = this.ctx.getUniformLocation(this.program, 'fov');
    this.programOrigin = this.ctx.getUniformLocation(this.program, 'origin');
    this.programView = this.ctx.getUniformLocation(this.program, 'view');
    this.programStencilLow = this.ctx.getUniformLocation(this.program, 'stencilLow');
    this.programStencilHigh = this.ctx.getUniformLocation(this.program, 'stencilHigh');
    this.programShadowMin = this.ctx.getUniformLocation(this.program, 'shadowMin');
    this.programShadowRange = this.ctx.getUniformLocation(this.program, 'shadowRange');
    this.programLight = this.ctx.getUniformLocation(this.program, 'light');
    this.programSteps = this.ctx.getUniformLocation(this.program, 'steps');
    this.programIFog = this.ctx.getUniformLocation(this.program, 'ifog');
    this.programLightCol = this.ctx.getUniformLocation(this.program, 'lightcol');
    this.programRandomSeed = this.ctx.getUniformLocation(this.program, 'randomSeed');

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
    let reset = 0;
    if (targetDustFrame < curFrame) {
      // reset
      reset = 1;
      curFrame = -2; // calculate initial positions then next positions
    }
    if (targetDustFrame > curFrame) {
      // advance
      this.ctx.enable(GL.RASTERIZER_DISCARD);
      this.ctx.useProgram(this.dustProgram);
      this.ctx.uniform4f(this.dustProgramLBound, -this.dust.extent, -this.dust.extent, this.dust.minz, this.dust.minsize);
      this.ctx.uniform4f(this.dustProgramUBound, this.dust.extent, this.dust.extent, this.dust.maxz, this.dust.maxsize);
      for (; curFrame < targetDustFrame; ++curFrame) {
        this.ctx.uniform1i(this.dustProgramReset, reset);
        reset = 0;
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
    const texture = this.ctx.createTexture();
    this.ctx.bindTexture(GL.TEXTURE_2D, texture);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST);
    this.ctx.texStorage2D(GL.TEXTURE_2D, 1, GL.R8, this.shadowMapSize, this.shadowMapSize);
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
    this.ctx.clearColor(1, 1, 1, 1);
    this.ctx.clear(GL.COLOR_BUFFER_BIT);
    this.ctx.blendEquation(GL.MIN);
    this.ctx.blendFunc(GL.ONE, GL.ONE);
    this.ctx.enable(GL.BLEND);

    this.ctx.useProgram(this.shadowProgram);
    this.ctx.uniform3f(this.shadowProgramLight, lightPos.x, lightPos.y, lightPos.z);
    this.ctx.uniform1f(this.shadowProgramMinZ, this.dust.minz);
    this.ctx.uniform1f(this.shadowProgramDepthScale, 1 / (this.dust.maxz - this.dust.minz));
    this.ctx.uniform1f(this.shadowProgramLerp, dustLerp);
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

    if (stereoscopic) {
      const sz = this.resize(this.width * 2, this.height, config.resolution);
      this.ctx.viewport(0, 0, sz.w / 2, sz.h);
      this._renderEye(config, -eyeSep * 0.5);
      this.ctx.viewport(sz.w / 2, 0, sz.w / 2, sz.h);
      this._renderEye(config, eyeSep * 0.5);
    } else {
      const sz = this.resize(this.width, this.height, config.resolution);
      this.ctx.viewport(0, 0, sz.w, sz.h);
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

    this.ctx.blendEquation(GL.FUNC_ADD);
    this.ctx.blendFunc(GL.ONE, GL.ONE);
    this.ctx.disable(GL.BLEND);

    this.ctx.bindVertexArray(this.quadVertexArray);

    if (config.grid) {
      this.ctx.useProgram(this.gridProgram);
      this.ctx.uniform2f(
        this.gridProgramFOV,
        config.view.fov * 0.5,
        -config.view.fov * 0.5 * this.height / this.width,
      );
      this.ctx.uniformMatrix3fv(this.gridProgramView, false, mat4xyz(view));
      this.ctx.uniform3f(this.gridProgramOrigin, view[12], view[13], view[14]);
      this.ctx.uniform1f(this.gridProgramLineW, config.resolution * 1.5);
      this.ctx.drawArrays(GL.TRIANGLE_STRIP, 0, 4);
    }

    if (!config.lights.length) {
      return;
    }

    this.ctx.enable(GL.BLEND);
    this.ctx.useProgram(this.program);
    this.ctx.uniform2f(
      this.programFOV,
      config.view.fov * 0.5,
      -config.view.fov * 0.5 * this.height / this.width,
    );
    this.ctx.uniform2f(this.programStencilLow, this.stencilInfo.minx, this.stencilInfo.miny);
    this.ctx.uniform2f(this.programStencilHigh, this.stencilInfo.maxx, this.stencilInfo.maxy);
    this.ctx.uniform1f(this.programShadowMin, this.dust.minz);
    this.ctx.uniform1f(this.programShadowRange, this.dust.maxz - this.dust.minz);
    this.ctx.uniform1i(this.programSteps, Math.min(Math.ceil(config.lightQuality / config.lights.length), this.maxStepsPerLight));
    this.ctx.uniform1f(this.programIFog, 1 - config.fog);
    this.ctx.uniformMatrix3fv(this.programView, false, mat4xyz(view));
    this.ctx.uniform3f(this.programOrigin, view[12], view[13], view[14]);

    this.ctx.activeTexture(GL.TEXTURE0);
    this.ctx.uniform1i(this.programStencil, 0);
    this.ctx.bindTexture(GL.TEXTURE_2D, this.stencil);

    this.ctx.activeTexture(GL.TEXTURE1);
    this.ctx.uniform1i(this.programShadow, 1);

    for (let i = 0; i < config.lights.length; ++i) {
      const light = config.lights[i];
      this.ctx.uniform3f(this.programLight, light.pos.x, light.pos.y, light.pos.z);
      this.ctx.uniform3f(this.programLightCol, light.col.r, light.col.g, light.col.b);
      this.ctx.uniform1ui(this.programRandomSeed, (config.time * 97 + i)|0);
      this.ctx.bindTexture(GL.TEXTURE_2D, this.shadowMaps[i].texture);
      this.ctx.drawArrays(GL.TRIANGLE_STRIP, 0, 4);
    }
    this.ctx.disable(GL.BLEND);
  }

  getImage() {
    return this.ctx.canvas.toDataURL('image/png');
  }
}
