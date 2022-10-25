'use strict';

const logo = pathChain([
  new ResizingPath2D('M0,0', 5, (p) => Math.pow(p, 0.25) * 9),
  20,
  new MyPath2D(`
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
  `, 9.5),
  [
    new MyPath2D(`
      M0,89
      h9
      a7 7 0 0 1 7,7
      v9
    `, 8.25),
    new MyPath2D(`
      M0,89
      h-9
      a7 7 0 0 0 -7,7
      v9
    `, 8.25),
  ],
  [
    [
      [
        new MyPath2D(`
          M14,105
          h-14
        `, 4.5),
        new MyPath2D(`
          M-14,105
          h14
        `, 4.5),
      ],
      new MyPath2D(`
        M0,104.5
        v-11.5
      `, 4.5),
      new ResizingPath2D('M0,93', 20, (p) => (1 - Math.pow(p, 0.25)) * 4.5),
    ],
    [
      [
        new MyPath2D(`
          M16,105
          v10
          a14 14 0 0 1 -14,14
          h-2
        `, 8.25),
        new MyPath2D(`
          M-16,105
          v10
          a14 14 0 0 0 14,14
          h2
        `, 8.25),
      ],
      new ResizingPath2D('M0,129', 20, (p) => (1 - Math.pow(p, 0.25)) * 8.25),
    ],
  ],
]).transform({ scale: 1 / 80, dx: 0, dy: -54 / 80 });
