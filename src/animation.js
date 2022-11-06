class Animate {
  constructor(duration) {
    this.duration = duration;
  }

  ease(config) {
    return new AnimateEase(this, config);
  }
}

class AnimateDelay extends Animate {
  constructor(duration) {
    super(duration);
  }

  at() {
    return [];
  }
}

class AnimateFunction extends Animate {
  constructor(duration, fn) {
    super(duration);
    this.fn = fn;
  }

  at(time) {
    return [this.fn(time)].flat();
  }
}

class AnimateEase extends Animate {
  constructor(baseAnimation, { beginSpeed = 1, endSpeed = 1 }) {
    super(0);
    const { bezier, scale } = velocityBezier(
      beginSpeed,
      endSpeed,
      1,
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

class AnimateParallel extends Animate {
  constructor(animations) {
    super(Math.max(...animations.map((a) => a.duration)));
    this.animations = animations;
  }

  at(time) {
    return this.animations.flatMap((a) => a.at(time));
  }
}

class AnimateSequence extends Animate {
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
