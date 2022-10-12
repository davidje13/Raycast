'use strict';

const dpr = window.devicePixelRatio;
window.devicePixelRatio = 1;

const canvasW = 640;
const canvasH = 480;
const stencilS = 2048;
const dustS = 1024;
const dustCount = 10000;
const maxDustZ = 8;
const minDustZ = -2;
const LIGHT_PROPORTIONS = [
  { r: 0.55, g: 0.00, b: 0.00, a: 0.00 },
  { r: 0.45, g: 0.30, b: 0.00, a: 0.25 },
  { r: 0.00, g: 0.40, b: 0.00, a: 0.50 },
  { r: 0.00, g: 0.30, b: 0.45, a: 0.75 },
  { r: 0.00, g: 0.00, b: 0.55, a: 1.00 },
];
const DEG2RAD = Math.PI / 180;

function makeStencilTarget(size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d', { alpha: false });
  return {
    canvas,
    ctx,
    size,
    minx: -1,
    miny: -1,
    maxx: 1,
    maxy: 1,
  };
}

const superStencil = makeStencilTarget(stencilS * 2);
const fullStencil = makeStencilTarget(stencilS);
const fastStencil = makeStencilTarget((stencilS / 4)|0);

const dust = new Float32Array(dustS * dustS);

function renderStencil(full) {
  const frame = getValue('frame');
  const target = (
    !full ? fastStencil :
    frame < 0.1 ? superStencil :
    fullStencil
  );

  const s = target.size;
  renderLogo(target.ctx, s, frame, getValue('trace'));
  const { data } = target.ctx.getImageData(0, 0, s, s);
  let minX = s;
  let minY = s;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < s; ++y) {
    for (let x = 0; x < s; ++x) {
      if (data[(y * s + x) * 4]) {
        minY = Math.min(minY, y);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        maxY = y;
      }
    }
  }
  target.minx = (minX - 1) * 2 / s - 1;
  target.miny = (minY - 1) * 2 / s - 1;
  target.maxx = (maxX + 1) * 2 / s - 1;
  target.maxy = (maxY + 1) * 2 / s - 1;
  return target;
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

function getValue(name) {
  const o = document.getElementsByName(name)[0];
  return Number.parseFloat(o.value);
}

function setValue(name, v) {
  const o = document.getElementsByName(name)[0];
  return o.value = v;
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

    this.stencilInfo = null;
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
      }`,

      `#version 300 es
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
      }`,
    );

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

  updateStencil(info) {
    this.stencilInfo = info;
    this.ctx.bindTexture(GL.TEXTURE_2D, this.stencil);
    this.ctx.texImage2D(
      GL.TEXTURE_2D,
      0,
      GL.RGB,
      info.size,
      info.size,
      0,
      GL.RGB,
      GL.UNSIGNED_BYTE,
      info.canvas.transferToImageBitmap(),
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
    this.resize(canvasW, canvasH, full ? dpr : 1);
    const totalSteps = full ? 1500 : 300;
    const maxStepsPerLight = 500;

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

    const fov = getValue('fov') * DEG2RAD * 0.5;

    const lights = [];
    for (let i = 1; i <= LIGHT_PROPORTIONS.length; ++i) {
      if (document.getElementsByName(`light${i}`)[0].checked) {
        lights.push(i);
      }
    }

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
    this.ctx.uniform2f(this.programStencilLow, this.stencilInfo.minx, this.stencilInfo.miny);
    this.ctx.uniform2f(this.programStencilHigh, this.stencilInfo.maxx, this.stencilInfo.maxy);
    this.ctx.uniform1f(this.programCutoutDepth, minDustZ);
    this.ctx.uniform1i(this.programSteps, Math.min(Math.ceil(totalSteps / lights.length), maxStepsPerLight));
    this.ctx.uniform1f(this.programIFog, 1 - getValue('fog'));

    this.ctx.blendFunc(GL.ONE, GL.ONE);
    this.ctx.disable(GL.BLEND);
    for (const i of lights) {
      const z = Math.max(-10000, -1 / Math.tan(getValue(`light${i}z`) * DEG2RAD));
      this.ctx.uniform3f(this.programLight, getValue(`light${i}x`), getValue(`light${i}y`), z);
      this.ctx.uniform3f(this.programLightCol, getValue(`light${i}r`), getValue(`light${i}g`), getValue(`light${i}b`));
      this.drawQuad(this.programV);

      this.ctx.enable(GL.BLEND);
    }
  }
}

function updateLights() {
  const x = getValue('lightCx');
  const y = getValue('lightCy');
  const z1 = getValue('lightCz1');
  const z2 = getValue('lightCz2');
  const exposure = getValue('lightCe');
  const r = getValue('lightCr') * exposure;
  const g = getValue('lightCg') * exposure;
  const b = getValue('lightCb') * exposure;

  if (z1 === z2) {
    document.getElementsByName('light1')[0].checked = true;
    setValue('light1x', x);
    setValue('light1y', y);
    setValue('light1z', z1);
    setValue('light1r', r);
    setValue('light1g', g);
    setValue('light1b', b);
    for (let i = 2; i <= LIGHT_PROPORTIONS.length; ++i) {
      document.getElementsByName(`light${i}`)[0].checked = false;
    }
    return;
  }

  for (let i = 1; i <= LIGHT_PROPORTIONS.length; ++i) {
    document.getElementsByName(`light${i}`)[0].checked = true;
    const props = LIGHT_PROPORTIONS[i - 1];

    setValue(`light${i}x`, x);
    setValue(`light${i}y`, y);
    setValue(`light${i}z`, (z2 - z1) * props.a + z1);
    setValue(`light${i}r`, r * props.r);
    setValue(`light${i}g`, g * props.g);
    setValue(`light${i}b`, b * props.b);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const renderer = new Renderer(document.getElementById('output'));

  const fastRender = () => renderer.render(false);
  const fullRender = () => setTimeout(() => renderer.render(true), 0);
  const fastLightGroup = () => {
    updateLights();
    fastRender();
  };
  const fullLightGroup = () => {
    updateLights();
    fullRender();
  };
  const fastStencil = () => {
    renderer.updateStencil(renderStencil(false));
    fastRender();
  };
  const fullStencil = () => {
    renderer.updateStencil(renderStencil(true));
    fullRender();
  };

  for (const i of document.getElementsByTagName('input')) {
    switch (i.dataset['target']) {
      case 'stencil':
        i.addEventListener('input', fastStencil);
        i.addEventListener('change', fullStencil);
        break;
      case 'light-group':
        i.addEventListener('input', fastLightGroup);
        i.addEventListener('change', fullLightGroup);
        break;
      default:
        i.addEventListener('input', fastRender);
        i.addEventListener('change', fullRender);
    }
  }

  updateLights();
  renderDust();
  renderer.updateDust(dust, dustS);
  fullStencil();
});
