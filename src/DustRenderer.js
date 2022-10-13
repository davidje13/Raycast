'use strict';

class DustRenderer {
  constructor(size, count, minz, maxz) {
    this.size = size;
    this.minz = minz;
    this.maxz = maxz;
    this.particles = [];
    this.data = new Float32Array(size * size);
    for (let i = 0; i < count; ++ i) {
      this.particles.push({
        x: Math.random() * size,
        y: Math.random() * size,
        z: Math.random() * (maxz - minz) + minz,
        r: (Math.random() * 0.003 + 0.001) * size,
      });
    }
  }

  // TODO: animate dust

  render() {
    const { size, data } = this;
    for (let i = 0; i < size * size; ++ i) {
      data[i] = Number.POSITIVE_INFINITY;
    }
    const depthScale = 2 / size;
    for (const particle of this.particles) {
      const px = particle.x|0;
      const py = particle.y|0;
      const pz = particle.z;
      const r2 = particle.r * particle.r;
      const ir = (particle.r + 1)|0;
      for (let y = py - ir; y < py + ir; ++y) {
        for (let x = px - ir; x < px + ir; ++x) {
          const d2 = (x - px) * (x - px) + (y - py) * (y - py);
          if (x < 0 || y < 0 || x >= size || y >= size || d2 > r2) {
            continue;
          }
          const p = y * size + x;
          data[p] = Math.min(data[p], pz - Math.sqrt(r2 - d2) * depthScale);
        }
      }
    }

    return {
      size,
      data,
      minz: this.minz,
      maxz: this.maxz,
    };
  }
}
