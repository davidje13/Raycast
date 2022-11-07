'use strict';

const SCENE_DURATION = 20;

function snapshot(config) {
  return getAnimatedScene(config).at(config.time);
}

function getAnimatedScene(config) {
  const logoDuration = SCENE_DURATION * 0.8;
  const finalCameraZ = 8;
  return new AnimateAll({
    ...config,
    time: new AnimateFunction(SCENE_DURATION, (v) => v),
    stencil: {
      ...config.stencil,
      shape: logo.withDuration(logoDuration),
    },
    dust: {
      ...config.dust,
      reflectivity: smoothBezierSequence([
        [SCENE_DURATION * 0.85, config.dust.reflectivity],
        [SCENE_DURATION, 0],
      ]),
    },
    lightFollow: smoothBezierSequence([
      [0, config.lightFollow],
      [logoDuration * 0.9, 0],
    ]),
    fog: smoothBezierSequence([
      [SCENE_DURATION * 0.85, config.fog],
      [SCENE_DURATION, 0],
    ]),
    view: {
      ...config.view,
      fovy: smoothBezierSequence([
        [logoDuration * 0.85, config.view.fovy],
        [SCENE_DURATION, Math.atan(3 / finalCameraZ)],
      ]),
      focusFollow: smoothBezierSequence([
        [logoDuration * 0.2, config.view.focusFollow],
        [logoDuration * 0.6, 0],
      ]),
      camera: {
        ...config.view.camera,
        x: smoothBezierSequence([
          [0, 0.1],
          [logoDuration * 0.5, config.view.camera.x],
          [logoDuration * 0.9, config.view.camera.x],
          [SCENE_DURATION, 0],
        ]),
        y: smoothBezierSequence([
          [logoDuration * 0.05, -0.5],
          [logoDuration * 0.15, 0.2],
          [logoDuration * 0.4, 0.2],
          [logoDuration * 0.9, config.view.camera.y],
          [SCENE_DURATION, 0],
        ]),
        z: smoothBezierSequence([
          [0, 0.1],
          [logoDuration * 0.3, 0.4, 0.2],
          [logoDuration * 0.9, config.view.camera.z, 0.5],
          [SCENE_DURATION, finalCameraZ],
        ]),
      },
      focus: {
        ...config.view.focus,
        y: smoothBezierSequence([
          [logoDuration * 0.15, -0.6],
          [logoDuration * 0.9, config.view.focus.y],
          [SCENE_DURATION, 0],
        ]),
      },
    },
  });
}

function bezierSequence(parts) {
  return new AnimateSequence(parts.map((p) => bezierFn(...p)));
}

function smoothBezierSequence(parts) {
  const curves = [];
  let lastTime = 0;
  let lastV = parts[0][1];
  let lastGrad = 0;
  for (let i = 0; i < parts.length; ++i) {
    const [time, v, grad = 0] = parts[i];
    const scale = (time - lastTime) / 3;
    curves.push(bezierFn(
      time - lastTime,
      lastV,
      lastV + lastGrad * scale,
      v - grad * scale,
      v,
    ));
    lastTime = time;
    lastV = v;
    lastGrad = grad;
  }
  return new AnimateSequence(curves);
}

function bezierFn(duration, a, b, c, d) {
  if (b === undefined) {
    return new AnimateConstant(duration, a);
  }
  const bezier = new CubicBezier(a, b, c, d);
  return new AnimateFunction(
    duration,
    (time) => bezier.at(Math.max(0, Math.min(1, time / duration))),
  );
}
