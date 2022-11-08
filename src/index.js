'use strict';

const dpr = window.devicePixelRatio;
window.devicePixelRatio = 1;

window.addEventListener('DOMContentLoaded', () => {
  const renderer = new Renderer(document.getElementById('output'), {
    width: 1920,
    height: 1080,
    shadowMapSize: 2048,
    dust: {
      count: 100000,
      extentx: 1.0,
      extenty: 2.0,
      minz: -0.5,
      maxz: 2.0,
      minsize: 0.002,
      maxsize: 0.006,
      updateInterval: 0.2,
    },
    stencilRenderer: StencilRenderer(512),
  });

  window.testLoseContext = () => {
    const ext = renderer.ctx.getExtension('WEBGL_lose_context');
    ext.loseContext();
    window.testRestoreContext = () => ext.restoreContext();
  };

  const hashWatch = new HashWatch();
  const ui = new UI((full) => {
    const config = ui.get(full);
    if (full) {
      hashWatch.setJSON(config);
    }
    renderer.render(snapshot(config));
  }, hashWatch.getJSON());

  hashWatch.onChange = () => {
    const config = hashWatch.getJSON();
    ui.set(config);
    renderer.render(snapshot(ui.get(true)));
  };

  const fps = 120;
  let animation = null;
  let frame;
  let time0;
  let recording = false;

  function startAnimation(full) {
    animation = getAnimatedScene(ui.get(full));
    frame = 0;
    time0 = Date.now();
    recording = false;
  }

  function uploadImage(frame, image) {
    fetch('/', { method: 'POST', body: frame + ':' + image }).catch((e) => {
      animation = null;
      console.error('Failed to upload image', e);
    });
  }

  document.getElementById('preview').addEventListener('click', () => {
    if (animation) {
      animation = null;
      return;
    }
    startAnimation(false);
    requestAnimationFrame(stepPreviewAnimation);
  });
  function stepPreviewAnimation() {
    if (!animation) {
      return;
    }
    const time = (Date.now() - time0) * 0.001;
    renderer.render(animation.atClamped(time));
    renderer.getImage(); // force sync flush
    if (time >= animation.duration) {
      animation = null;
    } else {
      requestAnimationFrame(stepPreviewAnimation);
    }
  }

  document.getElementById('play').addEventListener('click', () => {
    if (animation) {
      animation = null;
      return;
    }
    startAnimation(true);
    requestAnimationFrame(stepAnimation);
  });
  function stepAnimation() {
    if (!animation) {
      return;
    }
    const time = frame / fps;
    renderer.render(animation.atClamped(time));
    const image = renderer.getImage();
    if (recording) {
      uploadImage(frame, image);
    }
    if (time >= animation.duration) {
      animation = null;
    } else {
      ++frame;
      requestAnimationFrame(stepAnimation);
    }
  }

  document.getElementById('record').addEventListener('click', () => {
    if (animation) {
      animation = null;
      return;
    }
    startAnimation(true);
    recording = true;
    requestAnimationFrame(stepAnimation);
  });
  fetch('/check').then((r) => {
    if (r.status === 200) {
      document.getElementById('record').hidden = false;
    }
  });
});
