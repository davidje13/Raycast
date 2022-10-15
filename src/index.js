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
    },
    stencilRenderer: new StencilRenderer(renderLogo, 512),
  });

  buildUI((config) => renderer.render(config));
});
