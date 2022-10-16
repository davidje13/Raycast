'use strict';

// TODO: render using webgl for more accuracy
// (Path2D lines flicker slightly as total length changes)
// TODO: render with fuzzy edges (additive with linear gradient edge for each segment) and
// use thresholding in renderer for smooth outlines from low resolution stencil
// (make cutting circle smaller so edges still match)

class StencilRenderer {
  constructor(fn, size) {
    this.size = size;
    this.fn = fn;
    this.canvas = new OffscreenCanvas(size, size);
    this.ctx = this.canvas.getContext('2d', { alpha: false });
  }

  render({ frame, trace }) {
    const size = this.size;
    this.fn(this.ctx, size, frame, trace);
    const { data } = this.ctx.getImageData(0, 0, size, size);
    let minX = size;
    let minY = size;
    let maxX = 0;
    let maxY = 0;
    for (let y = 0; y < size; ++y) {
      for (let x = 0; x < size; ++x) {
        if (data[(y * size + x) * 4]) {
          minY = Math.min(minY, y);
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          maxY = y;
        }
      }
    }
    return {
      canvas: this.canvas,
      size,
      minx: (minX - 1) * 2 / size - 1,
      miny: (minY - 1) * 2 / size - 1,
      maxx: (maxX + 1) * 2 / size - 1,
      maxy: (maxY + 1) * 2 / size - 1,
    };
  }
}