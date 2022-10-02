'use strict';

const dpr = window.devicePixelRatio;
window.devicePixelRatio = 1;

const canvasW = 640;
const canvasH = 480;
const fastDownsample = 8;
const stencilS = 2048;
const dustS = 1024;
const dustCount = 10000;
const maxDustZ = 8;
const minDustZ = -2;
const e = 1e-6;

const stencil = new Float32Array(stencilS * stencilS);
const dust = new Float32Array(dustS * dustS);
const canvas = new Float32Array(canvasW * canvasH);
let minStencilX = 0;
let minStencilY = 0;
let maxStencilX = 0;
let maxStencilY = 0;

function renderStencil() {
  const c = document.getElementById('stencil');
  c.width = stencilS;
  c.height = stencilS;
  const ctx = c.getContext('2d', { alpha: false, willReadFrequently: true });
  renderLogo(ctx, getValue('frame'));

  const dat = ctx.getImageData(0, 0, stencilS, stencilS);

  for (let i = 0; i < stencilS * stencilS; ++i) {
    stencil[i] = dat.data[i * 4] / 255;
  }

  minStencilX = stencilS;
  minStencilY = stencilS;
  maxStencilX = 0;
  maxStencilY = 0;
  for (let y = 0; y < stencilS; ++y) {
    for (let x = 0; x < stencilS; ++x) {
      if (stencil[y * stencilS + x]) {
        minStencilY = Math.min(minStencilY, y);
        minStencilX = Math.min(minStencilX, x);
        maxStencilX = Math.max(maxStencilX, x);
        maxStencilY = y;
      }
    }
  }
  minStencilX = minStencilX * 2 / stencilS - 1;
  minStencilY = minStencilY * 2 / stencilS - 1;
  maxStencilX = maxStencilX * 2 / stencilS - 1;
  maxStencilY = maxStencilY * 2 / stencilS - 1;
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
  draw(document.getElementById('dust'), dustS, dustS, dust);
}

function getViewMatrix() {
  return makeViewMatrix(
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
}

function render(full) {
  const w = (full ? canvasW : canvasW / fastDownsample)|0;
  const h = (full ? canvasH : canvasH / fastDownsample)|0;
  const steps = full ? 200 : 10;
  const view = getViewMatrix();
  const lz = getValue('lightz');
  const ifog = 1 - getValue('fog');
  const exposure = getValue('exposure');
  const cx = 0.5 - w / 2;
  const cy = 0.5 - h / 2;

  const { x: ox, y: oy, z: oz } = applyMat4Point(view, { x: 0, y: 0, z: 0 });
  const fovm = (getValue('fov') * Math.PI) / (w * 180);

  const A = 1 - oz / lz;

  for (let y = 0; y < h; ++y) {
    for (let x = 0; x < w; ++x) {
      const { x: rx, y: ry, z: rz } = applyMat4Vec(
        view,
        makeSphericalRay(
          -1,
          Math.hypot(y + cy, x + cx) * fovm,
          Math.atan2(y + cy, x + cx),
        ),
      );

      const surface = getSurface(ox, oy, oz, rx, ry, rz);
      const B = -rz / lz;

      const tl = (ox - A * minStencilX) / (B * minStencilX - rx);
      const tr = (ox - A * maxStencilX) / (B * maxStencilX - rx);
      const tb = (oy - A * minStencilY) / (B * minStencilY - ry);
      const tt = (oy - A * maxStencilY) / (B * maxStencilY - ry);
      const tn = (maxDustZ - oz) / rz;
      const tf = ((surface ? minDustZ : 0) - oz) / rz;

      let tmin = Number.POSITIVE_INFINITY;
      let tmax = Number.POSITIVE_INFINITY;
      for (const t of [0, Math.min(tl, tr), Math.min(tt, tb), tn]) {
        if (t < 0 || t > tmin) {
          continue;
        }
        const m = A + B * t;
        const sx = ox + rx * t;
        const sy = oy + ry * t;
        const z = oz + rz * t;
        if (
          sx + e >= minStencilX * m && sx - e <= maxStencilX * m &&
          sy + e >= minStencilY * m && sy - e <= maxStencilY * m &&
          z + e >= 0 && z - e <= maxDustZ
        ) {
          tmin = t;
        }
      }
      for (const check of [tl, tr, tt, tb, tn, tf]) {
        if (check > tmin && check < tmax) {
          tmax = check;
        }
      }
      if (tmax === Number.POSITIVE_INFINITY) {
        canvas[y * w + x] = 0;
        continue;
      }
      //canvas[y * w + x] = (tmax - tmin) * 0.1 + 0.5;
      //continue;
      let accum = 0;
      let remaining = Math.pow(ifog, tmin);
      const step = (tmax - tmin) / steps;
      const ifogstep = Math.pow(ifog, step);
      for (let i = 0; i < steps; ++i) {
        const t = tmin + step * i;
        const m = 1 / (A + B * t);
        const sx = (ox + rx * t) * m * 0.5 + 0.5;
        const sy = (oy + ry * t) * m * 0.5 + 0.5;
        const z = oz + rz * t;
        const v = z <= 0
          ? surface
          : stencil[((sy * stencilS)|0) * stencilS + ((sx * stencilS)|0)];
        if (v) {
          const d = dust[((sy * dustS)|0) * dustS + ((sx * dustS)|0)];
          if (z < d) {
            // cheat: assume z ~= distance from surface for light attenuation due to fog
            accum += (
              v // light through stencil
              * Math.pow(ifog, z) // approx. attenuation due to fog on path of light
              * m * m // attenuation due to dispersal of light
              * (1 - ifogstep) // integral of fog over distance travelled by ray this step
              * remaining // integral of fog over ray so far
            );
          }
        }
        remaining *= ifogstep;
      }

      canvas[y * w + x] = (accum + surface * remaining) * exposure;
    }
  }

  draw(document.getElementById('output'), w, h, canvas, (full ? 1 : fastDownsample) / dpr);
}

function getSurface(ox, oy, oz, rx, ry, rz) {
  if (rz * oz >= 0) {
    return 0;
  }
  const tsurface = -oz / rz;
  const x = (ox + tsurface * rx) * 0.5 + 0.5;
  const y = (oy + tsurface * ry) * 0.5 + 0.5;
  if (x <= 0 || x >= 1 || y <= 0 || y >= 1) {
    return 0;
  }
  return stencil[((y * stencilS)|0) * stencilS + ((x * stencilS)|0)];
}

function draw(c, w, h, d, scale) {
  c.width = w;
  c.height = h;
  if (scale) {
    c.style.width = c.width * scale + 'px';
    c.style.height = c.height * scale + 'px';
  }
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

const fastRender = render.bind(null, false);
const fullRender = () => setTimeout(() => render(true), 0);

window.addEventListener('DOMContentLoaded', () => {
  for (const i of document.getElementsByTagName('input')) {
    i.addEventListener('input', fastRender);
  }
  for (const i of document.getElementsByTagName('input')) {
    i.addEventListener('change', fullRender);
  }
  const frame = document.getElementsByName('frame')[0];
  frame.removeEventListener('input', fastRender);
  frame.removeEventListener('change', fullRender);
  frame.addEventListener('input', () => {
    renderStencil();
    fastRender();
  });
  frame.addEventListener('change', () => {
    renderStencil();
    fullRender();
  });

  renderStencil();
  renderDust();
  fullRender();
});
