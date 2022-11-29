'use strict';

const dpr = window.devicePixelRatio;
window.devicePixelRatio = 1;

window.addEventListener('DOMContentLoaded', () => {
  const renderer = new Renderer(document.getElementById('output'), {
    width: 1920,
    height: 1080,
  });

  function render(config) {
    renderer.render(new AnimateAll(deserialiseAnimation(config)).at(0));
  }

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
    render(config);
  }, hashWatch.getJSON());

  hashWatch.onChange = () => {
    const config = hashWatch.getJSON();
    ui.set(config);
    render(ui.get(true));
  };
});
