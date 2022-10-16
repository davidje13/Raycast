'use strict';

function deepEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  const arr = Array.isArray(a);
  if (arr !== Array.isArray(b)) {
    return false;
  }
  if (arr) {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ks = Object.keys(a);
  if (ks.length !== Object.keys(b).length) {
    return false;
  }
  return ks.every((k) => deepEqual(a[k], b[k]));
}

function spectrumCol(from, to, peak, width) {
  from = Math.max(from, peak - width);
  to = Math.min(to, peak + width);
  if (to <= from) {
    return 0;
  }
  // n = x - peak
  // y = 1 - (n / width)^2
  // y = 1 - (x^2 - 2*x*peak - peak^2) / width^2
  // int(y)n = n - (n^3/3) / width^2
  return to - from + ((from - peak) ** 3 - (to - peak) ** 3) / (width * width * 3);
}

function lightConfigFromCluster({ x, y, z1, z2, r, g, b, count }) {
  if (count < 1 || (!r && !g && !b)) {
    return [];
  }

  if (z1 === z2 || count === 1) {
    return [
      {
        pos: { x, y, z: (z1 + z2) / 2 },
        col: { r, g, b },
      },
    ];
  }

  const lights = [];
  const sum = { r: 0, g: 0, b: 0 };
  const step = 1 / count;
  for (let i = 0; i < count; ++i) {
    const p = i * step;
    const col = {
      r: spectrumCol(p, p + step, 0.1, 0.4),
      g: spectrumCol(p, p + step, 0.5, 0.45),
      b: spectrumCol(p, p + step, 0.9, 0.4),
    };
    const light = { pos: { x, y, z: (z2 - z1) * (p + step * 0.5) + z1 }, col };
    lights.push(light);
    sum.r += col.r;
    sum.g += col.g;
    sum.b += col.b;
  }
  const mult = {
    r: sum.r > 0 ? r / sum.r : 0,
    g: sum.g > 0 ? g / sum.g : 0,
    b: sum.b > 0 ? b / sum.b : 0,
  };
  for (const light of lights) {
    light.col.r *= mult.r;
    light.col.g *= mult.g;
    light.col.b *= mult.b;
  }
  return lights;
}
