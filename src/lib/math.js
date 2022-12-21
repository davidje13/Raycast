'use strict';

const xyzTo3f = (v) => [v.x, v.y, v.z];

const sub3 = (v1, v2) => ({
  x: v1.x - v2.x,
  y: v1.y - v2.y,
  z: v1.z - v2.z,
});

const norm3 = (v) => {
  const s = 1 / Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return {
    x: v.x * s,
    y: v.y * s,
    z: v.z * s,
  };
};

const cross3 = (v1, v2) => ({
  x: v1.y * v2.z - v1.z * v2.y,
  y: v1.z * v2.x - v1.x * v2.z,
  z: v1.x * v2.y - v1.y * v2.x,
});

const mat4xyz = (m) => [
  m[0], m[1], m[2],
  m[4], m[5], m[6],
  m[8], m[9], m[10],
];

function makeViewMatrix(eye, target, up) {
  const z = norm3(sub3(eye, target));
  const x = norm3(cross3(up, z));
  const y = cross3(z, x);

  return [
    x.x, x.y, x.z, 0,
    y.x, y.y, y.z, 0,
    z.x, z.y, z.z, 0,
    eye.x, eye.y, eye.z, 1,
  ];
}

function mix(a, b, v) {
  return a * (1 - v) + b * v;
}

function mix3(a, b, v) {
  return { x: mix(a.x, b.x, v), y: mix(a.y, b.y, v), z: mix(a.z, b.z, v) };
}

function linearstep(l, u, v) {
  return Math.max(0, Math.min(1, (v - l) / (u - l)));
}

function smoothstep(l, u, v) {
  const t = linearstep(l, u, v);
  return t * t * (3 - 2 * t);
}

function hermiteInterpolate(v, d) {
  if (v < -d) {
    return 0;
  }
  if (v > d) {
    return 1;
  }
  const t = (v + d) / (d * 2);
  return t * t * (3 - 2 * t);
}

class CubicBezier {
  constructor(p0, p1, p2, p3) {
    this.p0 = p0;
    this.p1 = p1;
    this.p2 = p2;
    this.p3 = p3;
  }

  at(t) {
    const it = 1 - t;
    return (
      + it * it * it * this.p0
      + 3 * it * it * t * this.p1
      + 3 * it * t * t * this.p2
      + t * t * t * this.p3
    );
  }

  d1(t) {
    const it = 1 - t;
    return (
      + 3 * it * it * (this.p1 - this.p0)
      + 6 * it * t * (this.p2 - this.p1)
      + 3 * t * t * (this.p3 - this.p2)
    );
  }

  d2(t) {
    const it = 1 - t;
    return (
      + 6 * it * (this.p2 - 2 * this.p1 + this.p0)
      + 6 * t * (this.p3 - 2 * this.p2 + this.p1)
    );
  }

  solveD2(v) {
    return (
      (v / 6 - this.p2 + 2 * this.p1 - this.p0) /
      (this.p3 - 3 * this.p2 + 3 * this.p1 - this.p0)
    );
  }
}

function velocityBezier(v0, v1, vmid) {
  if (v0 < 0 || v1 < 0 || vmid < 0) {
    throw new Error('invalid velocityBezier condition');
  }

  // at(0) = 0
  // at(1) = 1
  // d1(0) = v0 * s
  // d1(1) = v1 * s
  // d1(solveD2(0)) = vmid * s

  // p0 = 0
  // p1 = p0 + v0 * s / 3
  // p2 = p3 - v1 * s / 3
  // p3 = 1
  // A = v0 + v1

  // solveD2(0) = (-p2 + 2 * p1 - p0) / (p3 - 3 * p2 + 3 * p1 - p0)
  // = (-(1 - v1 * s / 3) + 2 * v0 * s / 3) / (1 - 3 * (1 - v1 * s / 3) + 3 * v0 * s / 3)
  // = ((v0 + A) * s - 3) / (3 * A * s - 6)

  // d1(t) = (
  //   + (1 - t) * (1 - t) * v0 * s
  //   + 2 * (1 - t) * t * (3 - A * s)
  //   + t * t * v1 * s
  // )
  // = (
  //   + v0 * s
  //   + t * (6 - 2 * (v0 + A) * s)
  //   + t * t * (3 * A * s - 6)
  // )

  // d1(solveD2(0)) = (
  //   + v0 * s
  //   + (((v0 + A) * s - 3) / (3 * A * s - 6)) * (6 - 2 * (v0 + A) * s)
  //   + (((v0 + A) * s - 3) / (3 * A * s - 6)) * (((v0 + A) * s - 3) / (3 * A * s - 6)) * (3 * A * s - 6)
  // )
  // = (s * s * (A * v0 - A * A - v0 * v0) + s * A * 6 - 9) / (3 * A * s - 6)

  // d1(solveD2(0)) = vmid * s

  // s * s * (A * v0 - A * A - v0 * v0) + s * A * 6 - 9 = n * s * (3 * A * s - 6)
  // s * s * (A * v0 - A * A - v0 * v0 - 3 * n * A) + 6 * s * (A + n) - 9 = 0

  // (-b+/-sqrt(b^2-4ac))/2a
  // a = -(v0 * v0 + v0 * v1 + v1 * v1 + 3 * (v0 + v1) * n)
  // b = 6 * (v0 + v1 + n)
  // c = -9

  // = (
  //   -6 * (v0 + v1 + n)
  //   +/- sqrt((6 * (v0 + v1 + n)) * (6 * (v0 + v1 + n)) - 4 * -(v0 * v0 + v0 * v1 + v1 * v1 + 3 * (v0 + v1) * n) * -9)
  // ) / (2 * -(v0 * v0 + v0 * v1 + v1 * v1 + 3 * (v0 + v1) * n))

  // = 3 * (
  //   v0 + v1 + n
  //   +/- sqrt((v0 + v1 + n) * (v0 + v1 + n) - (v0 * v0 + v0 * v1 + v1 * v1 + 3 * (v0 + v1) * n))
  // ) / (v0 * v0 + v0 * v1 + v1 * v1 + 3 * (v0 + v1) * n)

  // (v0 + v1 + n) * (v0 + v1 + n) - (v0 * v0 + v0 * v1 + v1 * v1 + 3 * (v0 + v1) * n)
  // + v1 * v0
  // + n * n
  // - v0 * n
  // - v1 * n
  // (n - v0) * (n - v1)

  // thanks, https://www.wolframalpha.com/input?i=solve+%28s%5E2%28av-a%5E2-v%5E2%29%2B6as-9%29%2F%283as-6%29%3Ds*n+for+s

  let s;
  if (v0 === 0 && v1 === 0) {
    s = 1.5 / vmid;
  } else {
    const denominator = v0 * v0 + v0 * v1 + v1 * v1 + 3 * (v0 + v1) * vmid;
    const root = Math.max((vmid - v0) * (vmid - v1), 0);
    s = 3 * (v0 + v1 + vmid - Math.sqrt(root)) / denominator;
  }

  return {
    bezier: new CubicBezier(0, v0 * s / 3, 1 - v1 * s / 3, 1),
    scale: s,
  };
}
