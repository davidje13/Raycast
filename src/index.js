'use strict';

const dpr = window.devicePixelRatio;
window.devicePixelRatio = 1;

const canvasW = 640 * 2;
const canvasH = 480 * 2;
const fastDownsample = 8;
const stencilS = 512;
const dustS = 1024;
const dustCount = 10000;
const maxDustZ = 8;
const minDustZ = -2;

const stencilC = new OffscreenCanvas(stencilS, stencilS);
const stencilCtx = stencilC.getContext('2d', { alpha: false });

const dust = new Float32Array(dustS * dustS);
let minStencilX = -1;
let minStencilY = -1;
let maxStencilX = 1;
let maxStencilY = 1;

function renderStencil(full) {
  renderLogo(stencilCtx, stencilS, getValue('frame'), getValue('trace'));
  const { data } = stencilCtx.getImageData(0, 0, stencilS, stencilS);
  minStencilX = stencilS;
  minStencilY = stencilS;
  maxStencilX = 0;
  maxStencilY = 0;
  for (let y = 0; y < stencilS; ++y) {
    for (let x = 0; x < stencilS; ++x) {
      if (data[(y * stencilS + x) * 4]) {
        minStencilY = Math.min(minStencilY, y);
        minStencilX = Math.min(minStencilX, x);
        maxStencilX = Math.max(maxStencilX, x);
        maxStencilY = y;
      }
    }
  }
  minStencilX = (minStencilX - 1) * 2 / stencilS - 1;
  minStencilY = (minStencilY - 1) * 2 / stencilS - 1;
  maxStencilX = (maxStencilX + 1) * 2 / stencilS - 1;
  maxStencilY = (maxStencilY + 1) * 2 / stencilS - 1;
}

function renderDust() {
  for (let i = 0; i < dustS * dustS; ++ i) {
    dust[i] = Number.POSITIVE_INFINITY;
  }
  const depthScale = 2 / dustS;
  for (let i = 0; i < dustCount; ++ i) {
    const px = (Math.random() * dustS)|0;
    const py = (Math.random() * dustS)|0;
    const pz = Math.random() * (maxDustZ - minDustZ) + minDustZ;
    const pr = (Math.random() * 0.003 + 0.001) * dustS;
    const r2 = pr * pr;
    const ir = (pr + 1)|0;
    for (let y = py - ir; y < py + ir; ++y) {
      for (let x = px - ir; x < px + ir; ++x) {
        const d2 = (x - px) * (x - px) + (y - py) * (y - py);
        if (x < 0 || y < 0 || x >= dustS || y >= dustS || d2 > r2) {
          continue;
        }
        const p = y * dustS + x;
        dust[p] = Math.min(dust[p], pz - Math.sqrt(r2 - d2) * depthScale);
      }
    }
  }
}

function draw(c, w, h, d) {
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { alpha: false });
  const dat = new ImageData(w, h);
  const rgba = dat.data;
  for (let i = 0; i < w * h; ++i) {
    const v = d[i] * 256;
    rgba[i * 4    ] = v;
    rgba[i * 4 + 1] = v;
    rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  ctx.putImageData(dat, 0, 0);
}

function getValue(name) {
  const o = document.getElementsByName(name)[0];
  return Number.parseFloat(o.value);
}

class Renderer extends GLContext {
  constructor(canvas) {
    super(canvas, {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    this.resize((canvasW / dpr)|0, (canvasH / dpr)|0, dpr);

    this.stencil = this.ctx.createTexture();
    this.ctx.bindTexture(GL.TEXTURE_2D, this.stencil);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.LINEAR);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.LINEAR);

    this.dust = this.ctx.createTexture();
    this.ctx.bindTexture(GL.TEXTURE_2D, this.dust);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST);
    this.ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST);

    this.program = this.linkVertexFragmentProgram(
      `#version 300 es
      precision mediump float;
      uniform vec2 fov;
      in vec2 v;
      out vec2 p;
      void main(void) {
        p = v * fov;
        gl_Position = vec4(v, 0.0, 1.0);
      }`,

      `#version 300 es
      precision mediump float;
      const float inf = 1e38;
      const float e = 1e-6;
      uniform sampler2D stencil;
      uniform sampler2D dust;
      uniform vec3 origin;
      uniform mat3 view;
      uniform vec3 stencilLow;
      uniform vec3 stencilHigh;
      uniform float ilightz;
      uniform int steps;
      uniform float ifog;
      uniform vec3 lightcol;
      in vec2 p;
      out vec4 col;
      float checkRangeLow(float current, float A, float B, vec3 ray, float t) {
        if (t < 0.0 || t > current) {
          return current;
        }
        vec2 m = vec2(A - B * t, 1.0);
        vec3 s = origin + ray * t;
        if (
          all(greaterThanEqual(s, vec3(stencilLow.xy, 0.0) * m.xxy - e)) &&
          all(lessThanEqual(s, stencilHigh * m.xxy + e))
        ) {
          return t;
        }
        return current;
      }
      float checkRangeHigh(float current, float tmin, float t) {
        if (t > tmin && t < current) {
          return t;
        }
        return current;
      }
      void main(void) {
        float inclination = length(p);
        vec3 ray = view * -vec3(
          sin(inclination) * p / inclination,
          cos(inclination)
        );
        vec3 surface = ray.z >= 0.0 ? vec3(0.0) : texture(stencil, (origin.xy - ray.xy * origin.z / ray.z) * 0.5 + 0.5).xyz;
        float A = 1.0 - origin.z * ilightz; // constant
        float B = ray.z * ilightz;
        float tl = (A * stencilLow.x - origin.x) / (B * stencilLow.x + ray.x);
        float tr = (A * stencilHigh.x - origin.x) / (B * stencilHigh.x + ray.x);
        float tb = (A * stencilLow.y - origin.y) / (B * stencilLow.y + ray.y);
        float tt = (A * stencilHigh.y - origin.y) / (B * stencilHigh.y + ray.y);
        float tn = (stencilHigh.z - origin.z) / ray.z;
        float tf = ((surface == vec3(0.0) ? 0.0 : stencilLow.z) - origin.z) / ray.z;

        float tmin = checkRangeLow(inf, A, B, ray, 0.0);
        tmin = checkRangeLow(tmin, A, B, ray, min(tl, tr));
        tmin = checkRangeLow(tmin, A, B, ray, min(tt, tb));
        tmin = checkRangeLow(tmin, A, B, ray, tn);
        float tmax = checkRangeHigh(inf, tmin, tl);
        tmax = checkRangeHigh(tmax, tmin, tr);
        tmax = checkRangeHigh(tmax, tmin, tt);
        tmax = checkRangeHigh(tmax, tmin, tb);
        tmax = checkRangeHigh(tmax, tmin, tn);
        tmax = checkRangeHigh(tmax, tmin, tf);
        if (tmax == inf) {
          col = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }
        // (tmax - tmin) * 0.1 + 0.5
        vec3 accum = vec3(0.0);
        float remaining = pow(ifog, tmin);
        float step = (tmax - tmin) / float(steps);
        float ifogstep = pow(ifog, step);
        float t = tmin;
        for (int i = 0; i < steps; ++i) {
          float m = 1.0 / (A - B * t);
          vec3 pos = origin + ray * t;
          vec2 s = pos.xy * m * 0.5 + 0.5;
          vec3 v = pos.z <= 0.0 ? surface : texture(stencil, s).xyz;
          if (v != vec3(0.0)) {
            float d = texture(dust, s).x;
            if (pos.z < d) {
              // cheat: assume z ~= distance from surface for light attenuation due to fog
              accum += (
                v // light through stencil
                * pow(ifog, pos.z) // approx. attenuation due to fog on path of light
                * m * m // attenuation due to dispersal of light
                * (1.0 - ifogstep) // integral of fog over distance travelled by ray this step
                * remaining // integral of fog over ray so far
              );
            }
          }
          remaining *= ifogstep;
          t += step;
        }

        col = vec4((accum + surface * remaining) * lightcol, 1.0);
      }`,
    );

    this.programStencil = this.ctx.getUniformLocation(this.program, 'stencil');
    this.programDust = this.ctx.getUniformLocation(this.program, 'dust');
    this.programFOV = this.ctx.getUniformLocation(this.program, 'fov');
    this.programOrigin = this.ctx.getUniformLocation(this.program, 'origin');
    this.programView = this.ctx.getUniformLocation(this.program, 'view');
    this.programStencilLow = this.ctx.getUniformLocation(this.program, 'stencilLow');
    this.programStencilHigh = this.ctx.getUniformLocation(this.program, 'stencilHigh');
    this.programILightZ = this.ctx.getUniformLocation(this.program, 'ilightz');
    this.programSteps = this.ctx.getUniformLocation(this.program, 'steps');
    this.programIFog = this.ctx.getUniformLocation(this.program, 'ifog');
    this.programLightCol = this.ctx.getUniformLocation(this.program, 'lightcol');
    this.programV = this.ctx.getAttribLocation(this.program, 'v');
  }

  updateStencil(canvas) {
    this.ctx.bindTexture(GL.TEXTURE_2D, this.stencil);
    this.ctx.texImage2D(
      GL.TEXTURE_2D,
      0,
      GL.RGB,
      canvas.width,
      canvas.height,
      0,
      GL.RGB,
      GL.UNSIGNED_BYTE,
      canvas.transferToImageBitmap(),
    );
  }

  updateDust(data, size) {
    this.ctx.bindTexture(GL.TEXTURE_2D, this.dust);
    this.ctx.texImage2D(
      GL.TEXTURE_2D,
      0,
      GL.R32F,
      size,
      size,
      0,
      GL.RED,
      GL.FLOAT,
      data,
    );
  }

  render(full) {
    const view = makeViewMatrix(
      {
        x: getValue('camerax'),
        y: getValue('cameray'),
        z: getValue('cameraz'),
      },
      {
        x: getValue('focusx'),
        y: getValue('focusy'),
        z: getValue('focusz'),
      },
      {
        x: getValue('upx'),
        y: getValue('upy'),
        z: getValue('upz'),
      },
    );

    const fov = getValue('fov') * 0.5 * Math.PI / 180;

    this.ctx.useProgram(this.program);
    this.ctx.activeTexture(GL.TEXTURE0);
    this.ctx.bindTexture(GL.TEXTURE_2D, this.stencil);
    this.ctx.uniform1i(this.programStencil, 0);
    this.ctx.activeTexture(GL.TEXTURE1);
    this.ctx.bindTexture(GL.TEXTURE_2D, this.dust);
    this.ctx.uniform1i(this.programDust, 1);
    this.ctx.uniform2f(this.programFOV, fov, -fov * canvasH / canvasW);
    this.ctx.uniform3f(this.programOrigin, view[12], view[13], view[14]);
    this.ctx.uniformMatrix3fv(this.programView, false, [
      view[0], view[1], view[2],
      view[4], view[5], view[6],
      view[8], view[9], view[10],
    ]);
    this.ctx.uniform3f(this.programStencilLow, minStencilX, minStencilY, minDustZ);
    this.ctx.uniform3f(this.programStencilHigh, maxStencilX, maxStencilY, maxDustZ);
    this.ctx.uniform1i(this.programSteps, full ? 300 : 30);
    this.ctx.uniform1f(this.programIFog, 1 - getValue('fog'));

    let first = true;
    this.ctx.disable(GL.BLEND);
    for (let i = 1; i <= 5; ++i) {
      if (!document.getElementsByName(`light${i}`)[0].checked) {
        continue;
      }

      this.ctx.uniform1f(this.programILightZ, 1.0 / (getValue(`light${i}z`)));
      this.ctx.uniform3f(this.programLightCol, getValue(`light${i}r`), getValue(`light${i}g`), getValue(`light${i}b`));
      this.drawQuad(this.programV);

      if (first) {
        first = false;
        this.ctx.blendFunc(GL.ONE, GL.ONE);
        this.ctx.enable(GL.BLEND);
      }
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const renderer = new Renderer(document.getElementById('output'));

  const fastRender = () => renderer.render(false);
  const fullRender = () => setTimeout(() => renderer.render(true), 0);
  const fastStencil = () => {
    renderStencil(false);
    renderer.updateStencil(stencilC);
    renderer.render(false);
  };
  const fullStencil = () => {
    renderStencil(true);
    renderer.updateStencil(stencilC);
    setTimeout(() => renderer.render(true), 0);
  };

  for (const i of document.getElementsByTagName('input')) {
    switch (i.dataset['target']) {
      case 'stencil':
        i.addEventListener('input', fastStencil);
        i.addEventListener('change', fullStencil);
        break;
      case 'display':
      default:
        i.addEventListener('input', fastRender);
        i.addEventListener('change', fullRender);
    }
  }

  renderDust();
  renderer.updateDust(dust, dustS);
  fullStencil();
});
