'use strict';

const path1 = new Path2D(`
  M0,0
  v30
  h6
  a14 14 0 0 0 14,-14
  v-2
  a14 14 0 0 0 -14,-14
  h-19
  a7 7 0 0 0 -7,7
  v36
  a7 7 0 0 0 7,7
  h46
  a7 7 0 0 0 7,-7
  v-56
  a7 7 0 0 0 -7,-7
  h-66
  a7 7 0 0 0 -7,7
  v76
  a7 7 0 0 0 7,7
  h26
  a7 7 0 0 1 7,7
  v11
`);
const path2a = new Path2D(`
  M0,89
  h9
  a7 7 0 0 1 7,7
  v19
  a14 14 0 0 1 -14,14
  h-2
`);
const path2b = new Path2D(`
  M0,89
  h-9
  a7 7 0 0 0 -7,7
  v19
  a14 14 0 0 0 14,14
  h2
`);
const path3a = new Path2D(`
  M16,105
  h-16
`);
const path3b = new Path2D(`
  M-16,105
  h16
`);
const path4 = new Path2D(`
  M0,104
  v-15
`);

function renderLogo(ctx, progress) {
  const s = ctx.canvas.width;
  ctx.resetTransform();
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, s, s);

  ctx.setTransform({
    a: s / 160,
    b: 0,
    c: 0,
    d: s / 160,
    e: s / 2,
    f: s * 26 / 160,
  });
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#FFFFFF';

  let total = progress * (495 + 55 + 16 + 16);
  if (total >= 0) {
    setLineLen(ctx, total);
    ctx.lineWidth = 9;
    ctx.stroke(path1);
  }

  total -= 495;
  if (total >= 0) {
    setLineLen(ctx, total);
    ctx.lineWidth = 8;
    ctx.stroke(path2a);
    ctx.stroke(path2b);
  }

  total -= 55;
  if (total >= 0) {
    setLineLen(ctx, total);
    ctx.lineWidth = 4;
    ctx.stroke(path3a);
    ctx.stroke(path3b);
  }

  total -= 16;
  if (total >= 0) {
    setLineLen(ctx, total);
    ctx.lineWidth = 4;
    ctx.stroke(path4);
  }
}

function setLineLen(ctx, len) {
  ctx.setLineDash([Math.max(len, 0), 9999]);
}
