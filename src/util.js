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

function angleToDistance(angle) {
  return Math.max(-10000, -1 / Math.tan(angle));
}

function distanceToAngle(distance) {
  return Math.atan(-1 / distance);
}

function clusterToLights({ x, y, z1, z2, r, g, b, count }) {
  if (count < 1 || (!r && !g && !b)) {
    return [];
  }

  if (z1 === z2) {
    count = 1;
  }

  const a1 = distanceToAngle(z1);
  const a2 = distanceToAngle(z2);

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
    const light = {
      pos: {
        x,
        y,
        z: angleToDistance((a2 - a1) * (p + step * 0.5) + a1),
      },
      col,
    };
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

function lightsToCluster(lights) {
  const clusterN = lights.length;
  let clusterX = 0;
  let clusterY = 0;
  let clusterR = 0;
  let clusterG = 0;
  let clusterB = 0;
  for (const { pos, col } of lights) {
    clusterX += pos.x;
    clusterY += pos.y;
    clusterR += col.r;
    clusterG += col.g;
    clusterB += col.b;
  }
  if (clusterN) {
    const a1 = distanceToAngle(lights[0].pos.z);
    const a2 = distanceToAngle(lights[clusterN - 1].pos.z);
    const s = (a2 - a1) * 0.5 / Math.max(clusterN - 1, 1);
    const sat = Math.max(clusterR, clusterG, clusterB);
    return {
      x: clusterX / clusterN,
      y: clusterY / clusterN,
      z1: angleToDistance(a1 - s),
      z2: angleToDistance(a2 + s),
      r: sat === 0 ? 1 : clusterR / sat,
      g: sat === 0 ? 1 : clusterG / sat,
      b: sat === 0 ? 1 : clusterB / sat,
      e: sat,
      count: clusterN,
    };
  } else {
    return {
      x: 0,
      y: 0,
      z1: 0,
      z2: 0,
      r: 1,
      g: 1,
      b: 1,
      e: 0,
      count: clusterN,
    };
  }
}
