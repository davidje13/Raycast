'use strict';

// TODO: camera animation along path

window.addEventListener('DOMContentLoaded', () => {
  const renderer = new Renderer(document.getElementById('output'), {
    width: 640,
    height: 480,
    shadowMapSize: 1024,
    dust: {
      count: 100000,
      extentx: 1.0,
      extenty: 2.0,
      minz: -0.5,
      maxz: 2.0,
      minsize: 0.002,
      maxsize: 0.006,
      updateInterval: 0.1,
    },
    stencilRenderer: new StencilRenderer(renderLogo, 512),
  });

  const hashWatch = new HashWatch();
  const ui = new UI((config) => {
    hashWatch.set(config);
    renderer.render(config);
  }, hashWatch.get());

  hashWatch.onChange = (config) => {
    ui.set(config);
    renderer.render(ui.get(true));
  };

  let playing = false;
  let frame = 0;
  let framestep;
  const totalFrames = 1000;
  const fps = 30;
  let baseConfig = {};
  document.getElementById('preview').addEventListener('click', () => {
    playing = !playing;
    if (playing) {
      frame = 0;
      framestep = 2;
      baseConfig = ui.get(false);
      requestAnimationFrame(stepAnimation);
    }
  });
  document.getElementById('play').addEventListener('click', () => {
    playing = !playing;
    if (playing) {
      frame = 0;
      framestep = 1;
      baseConfig = ui.get(true);
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
    frame += framestep;
    requestAnimationFrame(stepAnimation);
  }
});
