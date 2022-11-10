'use strict';

const PATH_TRANSFORM = { scale: 1 / 80, dx: 0, dy: -54 / 80 };

function path(def) {
  return new MyPath2D(def).transform(PATH_TRANSFORM);
}

function lineWidth(size) {
  return size * PATH_TRANSFORM.scale;
}

function delay(lineLengthEquivalent) {
  return lineLengthEquivalent * PATH_TRANSFORM.scale;
}

function animateDrawLine(path, lineWidth, colour, drawColour) {
  return new AnimateFunction(path.length, (time) => {
    const truncated = path.truncate(time);
    return [
      new Line2D(truncated, lineWidth, colour),
      (drawColour && time < path.length)
        ? new Line2D(truncated.endPoint(), lineWidth, drawColour)
        : null,
    ];
  });
}

function animateDotAlongLine(path, lineWidth1, lineWidth2, colour) {
  const duration = path.length + Math.abs(lineWidth2 - lineWidth1) * 0.5;
  return new AnimateFunction(duration, (time) => {
    const pos = time / duration;
    const lineWidth = (lineWidth2 - lineWidth1) * pos + lineWidth1;
    if (pos < 0 || pos > 1 || lineWidth <= 0) {
      return [];
    }
    return [new Line2D(path.truncate(pos * path.length).endPoint(), lineWidth, colour)];
  });
}

function animateStatic(duration, path, lineWidth, colour) {
  const line = new Line2D(path, lineWidth, colour);
  return new AnimateFunction(duration, (time) => {
    if (time < 0 || time > duration) {
      return [];
    }
    return [line];
  });
}

const logo = new AnimateWrap(new AnimateBuildup([
  animateDotAlongLine(
    path('M0,0'),
    lineWidth(0),
    lineWidth(9.5),
    'white',
  ).ease({ beginSpeed: 2, endSpeed: 0 }),
  animateStatic(delay(20), path('M0,0'), lineWidth(9.5), 'white'),
  animateDrawLine(path(`
    M0,0
    v30
  `), lineWidth(9.5), 'grey', 'white').ease({ beginSpeed: 0, endSpeed: 0 }),
  animateStatic(delay(10), path('M0,30'), lineWidth(9.5), 'white'),
  animateDrawLine(path(`
    M0,30
    h6
    a14 14 0 0 0 14,-14
    v-2
    a14 14 0 0 0 -14,-14
    h-6
  `), lineWidth(9.5), 'grey', 'white').ease({ beginSpeed: 0 }),
  animateDrawLine(path(`
    M0,0
    h-13
    a7 7 0 0 0 -7,7
    v36
    a7 7 0 0 0 7,7
    h46
    a7 7 0 0 0 7,-7
  `), lineWidth(9.5), 'grey', 'white'),
  animateDrawLine(path(`
    M40,43
    v-56
    a7 7 0 0 0 -7,-7
    h-66
    a7 7 0 0 0 -7,7
    v76
    a7 7 0 0 0 7,7
    h26
  `), lineWidth(9.5), 'grey', 'white').ease({ midSpeed: 2 }),
  animateDrawLine(path(`
    M-7,70
    a7 7 0 0 1 7,7
    v11.375
  `), lineWidth(9.5), 'grey', 'white'),
  new AnimateAll([
    animateDotAlongLine(
      path(`
        M0,88.375
        v0.625
      `),
      lineWidth(9.5),
      lineWidth(6),
      'white',
    ).ease({ beginSpeed: 0, endSpeed: 2 }),
    animateDrawLine(path(`
      M0,89
      h9
      a7 7 0 0 1 7,7
      v9
    `), lineWidth(8.25), 'grey', 'white'),
    animateDrawLine(path(`
      M0,89
      h-9
      a7 7 0 0 0 -7,7
      v9
    `), lineWidth(8.25), 'grey', 'white'),
  ]),
  new AnimateAll([
    new AnimateBuildup([
      new AnimateAll([
        animateDrawLine(path(`
          M14,105
          h-14
        `), lineWidth(4.5), 'grey', 'white'),
        animateDrawLine(path(`
          M-14,105
          h14
        `), lineWidth(4.5), 'grey', 'white'),
      ]),
      animateDrawLine(path(`
        M0,105
        v-12
      `), lineWidth(4.5), 'grey', 'white'),
      animateDotAlongLine(path(`
        M0,93
        v0,-4
      `), lineWidth(4.5), lineWidth(0), 'white'),
    ]),
    new AnimateBuildup([
      new AnimateAll([
        animateDrawLine(path(`
          M16,105
          v10
          a14 14 0 0 1 -14,14
          h-2
        `), lineWidth(8.25), 'grey', 'white'),
        animateDrawLine(path(`
          M-16,105
          v10
          a14 14 0 0 0 14,14
          h2
        `), lineWidth(8.25), 'grey', 'white'),
      ]),
      animateDotAlongLine(path('M0,129'), lineWidth(8.25), lineWidth(0), 'white')
        .ease({ endSpeed: 2 }),
    ]),
  ]),
]), (lines) => new MultiLine2D(lines));
