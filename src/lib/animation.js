'use strict';

class Animate {
  constructor(duration) {
    this.duration = duration;
  }

  atClamped(time) {
    return this.at(Math.max(0, Math.min(this.duration, time)));
  }

  ease(config) {
    return new AnimateEase(this, config);
  }

  withDuration(duration) {
    return new AnimateScale(this, duration);
  }
}

class AnimateConstant extends Animate {
  constructor(duration, value = null) {
    super(duration);
    this.value = value;
  }

  at() {
    return this.value;
  }
}

class AnimateFunction extends Animate {
  constructor(duration, fn) {
    super(duration);
    this.fn = fn;
  }

  at(time) {
    return this.fn(time);
  }
}

class AnimateWrap extends Animate {
  constructor(baseAnimation, wrapper) {
    super(baseAnimation.duration);
    this.baseAnimation = baseAnimation;
    this.wrapper = wrapper;
  }

  at(time) {
    return this.wrapper(this.baseAnimation.at(time));
  }
}

class AnimateScale extends Animate {
  constructor(baseAnimation, duration) {
    super(duration);
    this.baseAnimation = baseAnimation;
    this.scale = baseAnimation.duration / duration;
  }

  at(time) {
    return this.baseAnimation.at(time * this.scale);
  }
}

class AnimateEase extends Animate {
  constructor(baseAnimation, { beginSpeed = 1, midSpeed = 1, endSpeed = 1 }) {
    super(0);
    const { bezier, scale } = velocityBezier(
      beginSpeed,
      endSpeed,
      midSpeed,
    );
    this.duration = baseAnimation.duration * scale;
    this.baseAnimation = baseAnimation;
    this.bezier = bezier;
  }

  at(time) {
    const t = time / this.duration;
    if (t < 0 || t > 1) {
      return this.baseAnimation.at(t * this.baseAnimation.duration);
    }
    return this.baseAnimation.at(this.bezier.at(t) * this.baseAnimation.duration);
  }
}

class AnimateAll extends Animate {
  constructor(structure) {
    super(Math.max(...deepFilter(structure, (a) => (a instanceof Animate)).map((a) => a.duration)));
    this.structure = structure;
  }

  at(time) {
    return deepVisit(this.structure, (o) => (o instanceof Animate) ? o.at(time) : o);
  }
}

class AnimateSequence extends Animate {
  constructor(animations) {
    super(animations.map((a) => a.duration).reduce((a, b) => a + b));
    this.animations = animations;
  }

  at(time) {
    if (time < 0) {
      return null;
    }
    for (let i = 0; i < this.animations.length; ++i) {
      const a = this.animations[i];
      if (time < a.duration) {
        return a.at(time);
      }
      time -= a.duration;
    }
    if (time < 1e-6 && this.animations.length > 0) {
      const a = this.animations[this.animations.length - 1];
      return a.at(a.duration);
    }
    return null;
  }
}

class AnimateBuildup extends Animate {
  constructor(animations) {
    super(animations.map((a) => a.duration).reduce((a, b) => a + b));
    this.animations = animations;
  }

  at(time) {
    const result = [];
    let accum = 0;
    for (let i = 0; i < this.animations.length && accum <= time; ++i) {
      const a = this.animations[i];
      const item = a.at(time - accum);
      if (item && item.length > 0) {
        result.push(...item);
      }
      accum += a.duration;
    }
    return result;
  }
}
