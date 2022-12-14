'use strict';

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
  constructor(def) {
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
    this.length = 0;
    for (const step of this.steps) {
      this.length += step.length;
    }
  }

  bounds() {
    return this.steps.map((s) => s.bounds()).reduce(combineBounds, BOUNDS_NONE);
  }

  transform({ scale = 1, dx = 0, dy = 0 }) {
    return new MyPath2D(this.steps.map((step) => step.transform(scale, dx, dy)));
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
    return new MyPath2D(truncSteps);
  }

  endPoint() {
    if (this.length === 0) {
      return this;
    }
    const end = this.steps[this.steps.length - 1];
    return new MyPath2D([new Move(end.x, end.y)]);
  }

  visit(fn) {
    for (const step of this.steps) {
      fn(step);
    }
  }
}

MyPath2D.EMPTY = new MyPath2D([], 0);

class Line2D {
  constructor(path, lineWidth, colour) {
    this.path = path;
    this.lineWidth = lineWidth;
    this.colour = colour;
  }

  transform(t) {
    return new Line2D(this.path.transform(t), this.lineWidth * (t.scale ?? 1), this.colour);
  }

  bounds() {
    return growBounds(this.path.bounds(), this.lineWidth * 0.5);
  }

  visit(fn) {
    this.path.visit((step) => fn(step, this));
  }
}

class MultiLine2D {
  constructor(lines) {
    if (Array.isArray(lines)) {
      this.lines = lines.flat(Number.POSITIVE_INFINITY).filter((line) => line);
    } else {
      this.lines = lines ? [lines] : [];
    }
  }

  transform(t) {
    return new MultiLine2D(this.lines.map((line) => line.transform(t)));
  }

  bounds() {
    return this.lines.map((line) => line.bounds()).reduce(combineBounds, BOUNDS_NONE);
  }

  visit(fn) {
    for (const line of this.lines) {
      line.visit(fn);
    }
  }
}
