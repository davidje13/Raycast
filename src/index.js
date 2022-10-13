'use strict';

// TODO: camera animation along path

window.addEventListener('DOMContentLoaded', () => {
  const renderer = new Renderer(document.getElementById('output'), {
    width: 640,
    height: 480,
    stencilRenderer: new StencilRenderer(renderLogo, 512),
    dustRenderer: new DustRenderer(1024, 10000, -2, 8),
  });

  buildUI((config) => renderer.render(config));
});
