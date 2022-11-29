'use strict';

const SCENE_DURATION = 40;

function addAnimation(config) {
  const logoDuration = SCENE_DURATION * 0.85;
  const configurableMoment = logoDuration * 0.9;
  const finalCameraZ = 8;
  return {
    ...config,
    dust: {
      ...config.dust,
      time: { animation: [[0, 0, 1], [SCENE_DURATION, SCENE_DURATION, 1]] },
      reflectivity: { animation: [
        [0, 0.1],
        [logoDuration * 0.7, 0.3, 0.01],
        [logoDuration, config.dust.reflectivity],
        [SCENE_DURATION, 0],
      ] },
    },
    stencil: {
      ...config.stencil,
      animationDuration: logoDuration,
    },
    lightFollow: { animation: [
      [0, config.lightFollow],
      [configurableMoment, 0],
    ] },
    fog: { animation: [
      [configurableMoment, config.fog],
      [SCENE_DURATION, 0],
    ] },
    view: {
      ...config.view,
      fovy: { animation: [
        [logoDuration * 0.6, config.view.fovy],
        [SCENE_DURATION, Math.atan(3 / finalCameraZ)],
      ] },
      focusFollow: { animation: [
        [logoDuration * 0.2, config.view.focusFollow],
        [logoDuration * 0.5, 0],
      ] },
      camera: {
        ...config.view.camera,
        x: { animation: [
          [0, 0.1],
          [logoDuration * 0.5, config.view.camera.x],
          [configurableMoment, config.view.camera.x],
          [SCENE_DURATION, 0],
        ] },
        y: { animation: [
          [logoDuration * 0.05, -0.5],
          [logoDuration * 0.15, 0.2],
          [logoDuration * 0.45, 0.1],
          [configurableMoment, config.view.camera.y, 0.1],
          [SCENE_DURATION, 0],
        ] },
        z: { animation: [
          [0, 0.1],
          [logoDuration * 0.3, 0.4, 0.1],
          [configurableMoment, config.view.camera.z, 0.5],
          [SCENE_DURATION, finalCameraZ],
        ] },
      },
      focus: {
        ...config.view.focus,
        y: { animation: [
          [logoDuration * 0.1, -0.6],
          [logoDuration * 0.3, -0.1],
          [logoDuration * 0.5, -0.2],
          [configurableMoment, config.view.focus.y],
          [SCENE_DURATION, 0],
        ] },
      },
      up: {
        ...config.view.up,
        y: { animation: [
          [configurableMoment, config.view.up.y],
          [SCENE_DURATION, -1],
        ] },
      },
    },
  };
}

function getAnimatedScene(config) {
  const animated = deserialiseAnimation(config);
  animated.stencil.shape = logo.withDuration(animated.stencil.animationDuration);
  return new AnimateAll(animated);
}
