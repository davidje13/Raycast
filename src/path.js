function combineBounds(a, b) {
  return {
    l: Math.min(a.l, b.l),
    r: Math.max(a.r, b.r),
    t: Math.min(a.t, b.t),
    b: Math.max(a.b, b.b),
  };
}

function growBounds(bb, r) {
  return {
    l: bb.l - r,
    r: bb.r + r,
    t: bb.t - r,
    b: bb.b + r,
  };
}

const BOUNDS_NONE = {
  l: Number.POSITIVE_INFINITY,
  r: Number.NEGATIVE_INFINITY,
  t: Number.POSITIVE_INFINITY,
  b: Number.NEGATIVE_INFINITY,
};

class Move {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.length = 0;
  }

  bounds() {
    return { l: this.x, r: this.x, t: this.y, b: this.y };
  }

  transform(scale, dx, dy) {
    return new Move(this.x * scale + dx, this.y * scale + dy);
  }

  truncate() {
    return this;
  }
}

class Line {
  constructor(x1, y1, x2, y2) {
    this.x1 = x1;
    this.y1 = y1;
    this.x = x2;
    this.y = y2;
    this.length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }

  bounds() {
    return {
      l: Math.min(this.x1, this.x),
      r: Math.max(this.x1, this.x),
      t: Math.min(this.y1, this.y),
      b: Math.max(this.y1, this.y),
    };
  }

  transform(scale, dx, dy) {
    return new Line(
      this.x1 * scale + dx,
      this.y1 * scale + dy,
      this.x * scale + dx,
      this.y * scale + dy,
    );
  }

  truncate(l) {
    if (l >= this.length) {
      return this;
    }
    const dx = this.x - this.x1;
    const dy = this.y - this.y1;
    const m = l / this.length;
    return new Line(this.x1, this.y1, this.x1 + dx * m, this.y1 + dy * m);
  }
}

function solveArc(prev, rx, ry, rot, large, sweep, x, y) {
  if (rx !== ry) {
    throw new Error('Unsupported arc (must be circular)');
  }
  const dx = x - prev.x;
  const dy = y - prev.y;
  const l = Math.sqrt(dx * dx + dy * dy);
  const r = Math.max(rx, l / 2);
  const s = Math.sqrt(r * r - l * l / 4) * ((large ^ sweep) ? -1 : 1);
  const cx = (prev.x + x) / 2 + s * dy / l;
  const cy = (prev.y + y) / 2 - s * dx / l;
  const a1 = Math.atan2(prev.y - cy, prev.x - cx);
  let da = Math.atan2(y - cy, x - cx) - a1;
  if (large) {
    // da = [-pi*2, -pi], [pi, pi*2]
    if (da < Math.PI) {
      if (da > 0) {
        da -= Math.PI * 2;
      } else if (da > -Math.PI) {
        da += Math.PI * 2;
      }
    }
  } else {
    // da = [-pi, pi]
    if (da > Math.PI) {
      da -= Math.PI * 2;
    } else if (da < -Math.PI) {
      da += Math.PI * 2;
    }
  }
  return new Arc(cx, cy, r, a1, da, x, y);
}

class Arc {
  constructor(cx, cy, r, a1, da, x2, y2) {
    this.x = x2 ?? (cx + Math.cos(a1 + da) * r);
    this.y = y2 ?? (cy + Math.sin(a1 + da) * r);
    this.r = r;
    this.cx = cx;
    this.cy = cy;
    this.a1 = a1;
    this.da = da;
    this.length = Math.abs(r * da);
  }

  bounds() {
    const { cx, cy, r, a1, da } = this;
    const x1 = cx + Math.cos(a1) * r;
    const y1 = cy + Math.sin(a1) * r;
    const a2 = a1 + da;
    const passes = (a) => (
      (a1 < a && a2 > a) ||
      (a1 < a + Math.PI * 2 && a2 > a + Math.PI * 2) ||
      (a1 < a - Math.PI * 2 && a2 > a - Math.PI * 2)
    );
    return {
      l: Math.min(x1, this.x, passes(Math.PI) ? cx - r : Number.POSITIVE_INFINITY),
      r: Math.max(x1, this.x, passes(0) ? cx + r : Number.NEGATIVE_INFINITY),
      t: Math.min(y1, this.y, passes(-Math.PI / 2) ? cy - r : Number.POSITIVE_INFINITY),
      b: Math.max(y1, this.y, passes(Math.PI / 2) ? cy + r : Number.NEGATIVE_INFINITY),
    };
  }

  transform(scale, dx, dy) {
    return new Arc(
      this.cx * scale + dx,
      this.cy * scale + dy,
      this.r * scale,
      this.a1,
      this.da,
    );
  }

  truncate(l) {
    if (l >= this.length) {
      return this;
    }
    const m = l / this.length;
    return new Arc(this.cx, this.cy, this.r, this.a1, this.da * m);
  }
}

const STEP_TYPES = new Map([
  ['M', (prev, [x, y]) => new Move(x, y)],
  ['m', (prev, [x, y]) => new Move(prev.x + x, prev.y + y)],
  ['H', (prev, [x]) => new Line(prev.x, prev.y, x, prev.y)],
  ['h', (prev, [x]) => new Line(prev.x, prev.y, prev.x + x, prev.y)],
  ['V', (prev, [y]) => new Line(prev.x, prev.y, prev.x, y)],
  ['v', (prev, [y]) => new Line(prev.x, prev.y, prev.x, prev.y + y)],
  ['L', (prev, [x, y]) => new Line(prev.x, prev.y, x, y)],
  ['l', (prev, [x, y]) => new Line(prev.x, prev.y, prev.x + x, prev.y + y)],
  ['A', (prev, [rx, ry, rot, large, sweep, x, y]) => solveArc(prev, rx, ry, rot, large, sweep, x, y)],
  ['a', (prev, [rx, ry, rot, large, sweep, x, y]) => solveArc(prev, rx, ry, rot, large, sweep, prev.x + x, prev.y + y)],
]);

class MyPath2D {
  constructor(def, radius = 0) {
    if (typeof def === 'string') {
      let cur = { x: Number.NaN, y: Number.NaN };
      this.steps = def
        .replace(/[\s,]+/g, ' ')
        .replace(/ $/g, '')
        .replace(/(\d\.)([-+])/g, '$1 $2')
        .replace(/ ?([a-zA-Z]) ?/g, ';$1 ')
        .split(';')
        .slice(1)
        .map((v) => {
          const [action, ...params] = v.split(' ');
          const type = STEP_TYPES.get(action);
          if (!type) {
            throw new Error(`Unsupported action: ${action}`);
          }
          const next = type(cur, params.map(Number.parseFloat));
          cur = next;
          return next;
        });
    } else if (Array.isArray(def)) {
      this.steps = def;
    } else {
      throw new Error('Invalid MyPath2D construction');
    }
    this.radius = radius;
    this.length = 0;
    for (const step of this.steps) {
      this.length += step.length;
    }
  }

  bounds() {
    if (!this.steps.length) {
      return BOUNDS_NONE;
    }
    return growBounds(this.steps.map((s) => s.bounds()).reduce(combineBounds), this.radius);
  }

  transform({ scale = 1, dx = 0, dy = 0 }) {
    return new MyPath2D(
      this.steps.map((step) => step.transform(scale, dx, dy)),
      this.radius * scale,
    );
  }

  truncate(l) {
    if (l >= this.length) {
      return this;
    }
    if (l < 0) {
      return MyPath2D.EMPTY;
    }
    let clength = 0;
    const truncSteps = [];
    for (const step of this.steps) {
      truncSteps.push(step.truncate(l - clength));
      clength += step.length;
      if (clength >= l) {
        break;
      }
    }
    return new MyPath2D(truncSteps, this.radius);
  }

  endPoint() {
    if (!this.steps.length) {
      return MyPath2D.EMPTY;
    }
    const end = this.steps[this.steps.length - 1];
    return new MyPath2D([new Move(end.x, end.y)], this.radius);
  }

  visit(fn) {
    for (const step of this.steps) {
      fn(step, this);
    }
  }
}

MyPath2D.EMPTY = new MyPath2D([], 0);

class ResizingPath2D extends MyPath2D {
  constructor(def, duration, radFn, pos = 1) {
    super(def, radFn(pos));
    this.duration = duration;
    this.pos = pos;
    this.radFn = radFn;
    this.length = duration * pos;
  }

  transform({ scale = 1, dx = 0, dy = 0 }) {
    return new ResizingPath2D(
      this.steps.map((step) => step.transform(scale, dx, dy)),
      this.duration * scale,
      (p) => this.radFn(p) * scale,
      this.pos,
    );
  }

  truncate(l) {
    if (l >= this.length) {
      return this;
    }
    if (l < 0) {
      return MyPath2D.EMPTY;
    }
    return new ResizingPath2D(this.steps, this.duration, this.radFn, l / this.duration);
  }
}

function pathChain(tree) {
  const flat = [];
  const load = (paths, start) => {
    if (Array.isArray(paths)) {
      for (const path of paths) {
        if (Array.isArray(path)) {
          start = Math.max(...path.map((p) => load(p, start)));
        } else {
          start = load(path, start);
        }
      }
    } else if (typeof paths === 'number') {
      start += paths;
    } else {
      flat.push({ start, path: paths });
      start += paths.length;
    }
    return start;
  };
  load(tree, 0);
  return new MultiPath2D(flat);
}

class MultiPath2D {
  constructor(paths) {
    this.paths = paths;
    this.length = Math.max(0, ...paths.map((p) => p.start + p.path.length));
  }

  bounds() {
    if (!this.paths.length) {
      return BOUNDS_NONE;
    }
    return this.paths.map(({ path }) => path.bounds()).reduce(combineBounds);
  }

  transform(opts) {
    return new MultiPath2D(this.paths.map((p) => ({
      start: p.start * (opts.scale ?? 1),
      path: p.path.transform(opts),
    })));
  }

  truncate(l) {
    if (l >= this.length) {
      return this;
    }
    if (l < 0) {
      return MultiPath2D.EMPTY;
    }
    const truncated = [];
    for (const p of this.paths) {
      if (p.start <= l) {
        truncated.push({ start: p.start, path: p.path.truncate(l - p.start) });
      }
    }
    return new MultiPath2D(truncated);
  }

  endPoints() {
    const ends = [];
    for (const p of this.paths) {
      if (p.start + p.path.length >= this.length - 1e-6) {
        ends.push({ start: this.length, path: p.path.endPoint() });
      }
    }
    return new MultiPath2D(ends);
  }

  visit(fn) {
    for (const { path } of this.paths) {
      path.visit(fn);
    }
  }
}

MultiPath2D.EMPTY = new MultiPath2D([]);
