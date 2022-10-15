'use strict';

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
