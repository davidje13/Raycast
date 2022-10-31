'use strict';

// TODO: camera animation along path

const dpr = window.devicePixelRatio;
window.devicePixelRatio = 1;

window.addEventListener('DOMContentLoaded', () => {
  const renderer = new Renderer(document.getElementById('output'), {
    width: 1920,
    height: 1080,
    displayScale: 0.5,
    shadowMapSize: 2014,
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
    stencilRenderer: StencilRenderer(512, logo),
  });

  const hashWatch = new HashWatch();
  const ui = new UI((full) => {
    const config = ui.get(full);
    if (full) {
      hashWatch.setJSON(config);
    }
    renderer.render(config);
  }, hashWatch.getJSON());

  hashWatch.onChange = () => {
    const config = hashWatch.getJSON();
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
