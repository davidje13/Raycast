'use strict';

// TODO: camera animation along path

window.addEventListener('DOMContentLoaded', () => {
  const renderer = new Renderer(document.getElementById('output'), {
    width: 640,
    height: 480,
    shadowMapSize: 1024,
    dust: {
      count: 20000,
      extent: 2.0,
      minz: -1.0,
      maxz: 3.0,
      minsize: 0.005,
      maxsize: 0.010,
      updateInterval: 0.1,
    },
    stencilRenderer: new StencilRenderer(renderLogo, 512),
  });

  buildUI((config) => renderer.render(config));

  let playing = false;
  let frame = 0;
  const totalFrames = 1000;
  const fps = 30;
  let baseConfig = {};
  document.getElementById('play').addEventListener('click', () => {
    playing = !playing;
    if (playing) {
      frame = 0;
      baseConfig = getConfig(true);
      requestAnimationFrame(stepAnimation);
    }
  });
  function stepAnimation() {
    if (!playing) {
      return;
    }
    renderer.render({
      ...baseConfig,
      time: frame / fps,
      stencil: {
        ...baseConfig.stencil,
        frame: frame / totalFrames,
      },
    });
    const imageData = renderer.getImage(); // force sync flush (TODO: record to video)
    document.getElementById('outputImg').src = imageData;
    if (frame >= totalFrames) {
      playing = false;
      return;
    }
    ++frame;
    requestAnimationFrame(stepAnimation);
  }
});
