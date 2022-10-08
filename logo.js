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
  M14,105
  h-14
`);
const path3b = new Path2D(`
  M-14,105
  h14
`);
const path4 = new Path2D(`
  M0,104.5
  v-11.5
`);

function renderLogo(ctx, progress, trace) {
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

  const traceC = (Math.min(trace * 256, 255)|0).toString(16).padStart(2, '0');
  const traceCol = `#${traceC}${traceC}${traceC}`;
  const pointCol = '#FFFFFF';

  let total = progress * (494 + 55 + 14 + 12);
  drawLines(ctx, [path1], 9, total, traceCol, pointCol);

  total -= 494;
  drawLines(ctx, [path2a, path2b], 8, total, traceCol, pointCol);

  total -= 55;
  drawLines(ctx, [path3a, path3b], 4, total, traceCol, pointCol);

  total -= 14;
  drawLines(ctx, [path4], 4, total, traceCol, pointCol);
}

function drawLines(ctx, paths, width, length, traceCol, pointCol) {
  if (length >= 0) {
    ctx.lineWidth = width;

    ctx.lineDashOffset = 0;
    ctx.setLineDash([length, 9999]);
    ctx.strokeStyle = traceCol;
    paths.forEach((path) => ctx.stroke(path));

    ctx.lineDashOffset = -length;
    ctx.setLineDash([0, 9999]);
    ctx.strokeStyle = pointCol;
    paths.forEach((path) => ctx.stroke(path));
  }
}
