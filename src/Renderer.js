'use strict';

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
uniform sampler2D dust;
uniform vec3 origin;
uniform mat3 view;
uniform int steps;
uniform float ifog;
uniform vec3 light;
uniform vec3 lightcol;
uniform float cutoutDepth;

in vec2 p;
flat in float A;
flat in vec2 lbound;
flat in vec2 ubound;
flat in int inside;

out vec4 col;

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
    tf = ((surface == vec3(0.0) ? 0.0 : cutoutDepth) - origin.z) / ray.z;
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

  //col = vec4(vec3(tmax - tmin) * 0.1 + 0.5, 1.0);return;

  vec3 accum = vec3(0.0);
  float remaining = pow(ifog, tmin);

  if (tmax > tmin) {
    float step = (tmax - tmin) / float(steps);
    float ifogstep = pow(ifog, step);
    float t = tmin;
    for (int i = 0; i < steps; ++i) {
      float m = 1.0 / (A - B * t);
      vec3 pos = origin + ray * t;
      vec3 P = pos - light;
      vec2 s = (P.xy * m + light.xy) * 0.5 + 0.5;
      vec3 v = pos.z > 0.0 ? texture(stencil, s).xyz : surface;
      if (v != vec3(0.0)) {
        float d = texture(dust, s).x;
        if (pos.z < d) {
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

class Renderer extends GLContext {
  constructor(canvas, { width, height, stencilRenderer, dustRenderer }) {
    super(canvas, {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    this.resize(width, height, 1);

    this.width = width;
    this.height = height;
    this.stencilRenderer = stencilRenderer;
    this.dustRenderer = dustRenderer;
    this.latestConfig = {};

    this.stencilInfo = null;
    this.stencil = this.ctx.createTexture();
    this.ctx.bindTexture(GL.TEXTURE_2D, this.stencil);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.LINEAR);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.LINEAR);

    this.dustInfo = null;
    this.dust = this.ctx.createTexture();
    this.ctx.bindTexture(GL.TEXTURE_2D, this.dust);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST);

    this.program = this.linkVertexFragmentProgram(RENDER_VERT, RENDER_FRAG);

    this.programStencil = this.ctx.getUniformLocation(this.program, 'stencil');
    this.programDust = this.ctx.getUniformLocation(this.program, 'dust');
    this.programFOV = this.ctx.getUniformLocation(this.program, 'fov');
    this.programOrigin = this.ctx.getUniformLocation(this.program, 'origin');
    this.programView = this.ctx.getUniformLocation(this.program, 'view');
    this.programStencilLow = this.ctx.getUniformLocation(this.program, 'stencilLow');
    this.programStencilHigh = this.ctx.getUniformLocation(this.program, 'stencilHigh');
    this.programCutoutDepth = this.ctx.getUniformLocation(this.program, 'cutoutDepth');
    this.programLight = this.ctx.getUniformLocation(this.program, 'light');
    this.programSteps = this.ctx.getUniformLocation(this.program, 'steps');
    this.programIFog = this.ctx.getUniformLocation(this.program, 'ifog');
    this.programLightCol = this.ctx.getUniformLocation(this.program, 'lightcol');
    this.programV = this.ctx.getAttribLocation(this.program, 'v');
  }

  render(config) {
    if (deepEqual(config, this.latestConfig)) {
      return;
    }

    if (!deepEqual(config.stencil, this.latestConfig.stencil)) {
      this.stencilInfo = this.stencilRenderer.render(config.stencil);
      this.ctx.bindTexture(GL.TEXTURE_2D, this.stencil);
      this.ctx.texImage2D(
        GL.TEXTURE_2D,
        0,
        GL.RGB,
        this.stencilInfo.size,
        this.stencilInfo.size,
        0,
        GL.RGB,
        GL.UNSIGNED_BYTE,
        this.stencilInfo.canvas.transferToImageBitmap(),
      );
    }
    if (!deepEqual(config.lights, this.latestConfig.lights)) {
      // TODO: render dust as shadow map per light source
      //this.ctx.framebufferTexture2D(
      //  GL.FRAMEBUFFER,
      //  GL.DEPTH_ATTACHMENT,
      //  GL.TEXTURE_2D,
      //  this.dust,
      //  0
      //);
      this.dustInfo = this.dustRenderer.render();
      this.ctx.bindTexture(GL.TEXTURE_2D, this.dust);
      this.ctx.texImage2D(
        GL.TEXTURE_2D,
        0,
        GL.R32F,
        this.dustInfo.size,
        this.dustInfo.size,
        0,
        GL.RED,
        GL.FLOAT,
        this.dustInfo.data,
      );
    }

    const eyeSep = config.view.eyeSeparation;
    const stereoscopic = Boolean(eyeSep);
    const totalSteps = config.lightQuality;
    const maxStepsPerLight = 500;

    const view = makeViewMatrix(config.view.camera, config.view.focus, config.view.up);

    this.ctx.useProgram(this.program);
    this.ctx.activeTexture(GL.TEXTURE0);
    this.ctx.bindTexture(GL.TEXTURE_2D, this.stencil);
    this.ctx.uniform1i(this.programStencil, 0);
    this.ctx.activeTexture(GL.TEXTURE1);
    this.ctx.bindTexture(GL.TEXTURE_2D, this.dust);
    this.ctx.uniform1i(this.programDust, 1);
    this.ctx.uniform2f(
      this.programFOV,
      config.view.fov * 0.5,
      -config.view.fov * 0.5 * this.height / this.width,
    );
    this.ctx.uniformMatrix3fv(this.programView, false, mat4xyz(view));
    this.ctx.uniform2f(this.programStencilLow, this.stencilInfo.minx, this.stencilInfo.miny);
    this.ctx.uniform2f(this.programStencilHigh, this.stencilInfo.maxx, this.stencilInfo.maxy);
    this.ctx.uniform1f(this.programCutoutDepth, this.dustInfo.minz);
    this.ctx.uniform1i(this.programSteps, Math.min(Math.ceil(totalSteps / config.lights.length), maxStepsPerLight));
    this.ctx.uniform1f(this.programIFog, 1 - config.fog);

    if (stereoscopic) {
      const sz = this.resize(this.width * 2, this.height, config.resolution);
      this.ctx.viewport(0, 0, sz.w / 2, sz.h);
      this._renderEye(config, view, -eyeSep * 0.5);
      this.ctx.viewport(sz.w / 2, 0, sz.w / 2, sz.h);
      this._renderEye(config, view, eyeSep * 0.5);
    } else {
      const sz = this.resize(this.width, this.height, config.resolution);
      this.ctx.viewport(0, 0, sz.w, sz.h);
      this._renderEye(config, view, 0);
    }

    this.latestConfig = config;
  }

  _renderEye(config, view, eyeShift) {
    this.ctx.uniform3f(
      this.programOrigin,
      view[12] + view[0] * eyeShift,
      view[13] + view[1] * eyeShift,
      view[14] + view[2] * eyeShift,
    );
    this.ctx.blendFunc(GL.ONE, GL.ONE);
    this.ctx.disable(GL.BLEND);
    for (const light of config.lights) {
      this.ctx.uniform3f(this.programLight, light.x, light.y, light.z);
      this.ctx.uniform3f(this.programLightCol, light.r, light.g, light.b);
      this.drawQuad(this.programV);

      this.ctx.enable(GL.BLEND);
    }
  }
}
