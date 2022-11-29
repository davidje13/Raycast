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

function deepVisit(o, visitor) {
  const n = visitor(o);
  if (n !== o || !n || typeof n !== 'object') {
    return n;
  }
  if (Array.isArray(n)) {
    const r = [];
    let change = false;
    for (const v of n) {
      const vn = deepVisit(v, visitor);
      r.push(vn);
      change ||= (vn !== v);
    }
    return change ? r : n;
  }
  const r = Object.create(Object.getPrototypeOf(n));
  let change = false;
  for (const k in n) {
    if (!(k in r)) {
      const v = n[k];
      const vn = deepVisit(v, visitor);
      r[k] = vn;
      change ||= (vn !== v);
    }
  }
  return change ? r : n;
}

function deepFilter(o, condition) {
  if (condition(o)) {
    return [o];
  }
  const r = [];
  if (o && typeof o === 'object') {
    for (const k in o) {
      r.push(...deepFilter(o[k], condition));
    }
  }
  return r;
}

function deepWrite(o, [key, ...path], value) {
  if (!o || typeof o !== 'object') {
    throw new Error('invalid target: ' + o);
  }
  if (!path.length) {
    if ((key in o) && !Object.prototype.hasOwnProperty.call(o, key)) {
      throw new Error('invalid property: ' + key);
    }
    o[key] = value;
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(o, key)) {
    if (key in o) {
      throw new Error('invalid property: ' + key);
    }
    o[key] = {};
  }
  deepWrite(o[key], path, value);
}

function deepRead(o, [key, ...path]) {
  if (!key) {
    return o;
  }
  if (!o || typeof o !== 'object' || !Object.prototype.hasOwnProperty.call(o, key)) {
    return null;
  }
  return deepRead(o[key], path);
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
