'use strict';

const IDENT_MAT3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const xyzTo3f = (v) => [v.x, v.y, v.z];

const sub3 = (v1, v2) => ({
  x: v1.x - v2.x,
  y: v1.y - v2.y,
  z: v1.z - v2.z,
});

const length3 = (v) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

const norm3 = (v) => {
  const s = 1 / length3(v);
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

const dot3 = (v1, v2) => (v1.x * v2.x + v1.y * v2.y + v1.z * v2.z);

const matSum = (...ms) => ms.reduce((m1, m2) => m1.map((v, i) => v + m2[i]));

const matScale = (m, s) => m.map((v) => v * s);

const matMul = (size, m1, m2) => {
  const r = [];
  for (let i = 0; i < size; ++i) {
    for (let j = 0; j < size; ++j) {
      let v = 0;
      for (let k = 0; k < size; ++k) {
        v += m1[i * size + k] * m2[k * size + j];
      }
      r.push(v);
    }
  }
  return r;
};
const mat3mul = matMul.bind(null, 3);

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

function skewSymetricCrossProductMatrix(v) {
  return [
    0, -v.z, v.y,
    v.z, 0, -v.x,
    -v.y, v.x, 0,
  ];
}

function makeRotationMatrix(v1, v2) {
  // thanks, https://math.stackexchange.com/a/476311
  const scale = 1 + dot3(v1, v2);
  if (scale < 1e-6) {
    return [-1, 0, 0, 0, -1, 0, 0, 0, -1];
  }
  const ssm = skewSymetricCrossProductMatrix(cross3(v1, v2));

  return matSum(IDENT_MAT3, ssm, matScale(mat3mul(ssm, ssm), 1 / scale));
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

function evenSphericalPoints(n, maxPhi = Math.PI * 2) {
  // thanks, https://extremelearning.com.au/how-to-evenly-distribute-points-on-a-sphere-more-effectively-than-the-canonical-fibonacci-lattice/
  // (basic Fibonacci lattice projected to sphere used here, no modifications)
  // spiral from [0, 0, 1]
  const points = [];
  const GR = (1 + Math.sqrt(5)) / 2;
  for (let i = 0; i < n; ++i) {
    const theta = Math.PI * 2 * i / GR;
    const phi = Math.acos(1 - (i * 2 + 1) / n);
    if (phi > maxPhi) {
      break;
    }
    const sinPhi = Math.sin(phi);
    points.push({ x: Math.cos(theta) * sinPhi, y: Math.sin(theta) * sinPhi, z: Math.cos(phi) });
  }
  if (!points.length) {
    points.push({ x: 0, y: 0, z: 1 });
  }
  return points;
}
