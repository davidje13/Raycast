'use strict';

const dpr = window.devicePixelRatio;
window.devicePixelRatio = 1;

const FORM_CONFIG = [
  {
    title: 'Scene',
    rows: [
      [
        { key: 'resolution', type: 'const', value: 0.25, fullValue: 1 },
        { label: 'Grid', key: 'grid', type: 'boolean', def: false },
      ],
    ],
  },
  {
    title: 'Terrain',
    rows: [
      [
        { label: 'Zoom', key: 'zoom', type: 'number', min: 0, max: 2, def: 0.4 },
        { label: 'Height', key: 'terrainHeight', type: 'number', min: 0, max: 5, def: 2.2 },
        { label: 'Large Scale Zoom', key: 'largeZoom', type: 'number', min: 0, max: 2, def: 0.17 },
        { label: 'Large Scale Height', key: 'largeHeight', type: 'number', min: 0, max: 2, def: 0.8 },
      ],
      [
        { label: 'Flatness', key: 'flatness', type: 'number', min: 0, max: 10, def: 3.25 },
        { label: 'Cliff Flatness', key: 'cliffFlatness', type: 'number', min: 0, max: 1, def: 0.4 },
        { label: 'Peak Flatness', key: 'peakFlatness', type: 'number', min: -0.5, max: 2, def: 0.2 },
      ],
    ],
  },
  {
    title: 'Water',
    rows: [
      [
        { label: 'Height', key: 'waterHeight', type: 'number', min: 0, max: 3, def: 0.72 },
      ],
      [
        { label: 'Ripple Zoom', key: 'ripple.zoom', type: 'number', min: 0, max: 400, def: 80 },
        { label: 'Ripple Height', key: 'ripple.height', type: 'number', min: 0, max: 0.002, def: 0.0005 },
        { label: 'Ripple Shift X', key: 'ripple.shift.x', type: 'number', min: -10, max: 10, def: 0 },
        { label: 'Ripple Shift Y', key: 'ripple.shift.y', type: 'number', min: -10, max: 10, def: 0 },
      ],
    ],
  },
  {
    title: 'Sun',
    rows: [
      [
        { label: 'X', key: 'sun.x', type: 'number', min: -1, max: 1, def: -0.4 },
        { label: 'Y', key: 'sun.y', type: 'number', min: -1, max: 1, def: -0.6 },
        { label: 'Z', key: 'sun.z', type: 'number', min: -1, max: 1, def: 0.2 },
      ],
    ],
  },
  {
    title: 'Camera',
    rows: [
      [
        { label: 'X', key: 'view.camera.x', type: 'number', min: -5, max: 5, def: 0 },
        { label: 'Y', key: 'view.camera.y', type: 'number', min: -5, max: 5, def: 2.8 },
        { label: 'Z', key: 'view.camera.z', type: 'number', min: 0, max: 4, def: 1 },
      ],
      [
        { label: 'FOV-y', key: 'view.fovy', type: 'number', min: 0, max: 180, def: 50, scale: Math.PI / 180 },
        { label: 'Eye Separation', key: 'view.eyeSeparation', type: 'number', min: 0, max: 0.1, def: 0 },
      ],
    ],
  },
  {
    title: 'Focus',
    rows: [
      [
        { label: 'X', key: 'view.focus.x', type: 'number', min: -2, max: 2, def: 0 },
        { label: 'Y', key: 'view.focus.y', type: 'number', min: -2, max: 2, def: 0 },
        { label: 'Z', key: 'view.focus.z', type: 'number', min: 0, max: 2, def: 0.7 },
      ],
    ],
  },
  {
    title: 'Up',
    rows: [
      [
        { label: 'X', key: 'view.up.x', type: 'number', min: -1, max: 1, def: 0 },
        { label: 'Y', key: 'view.up.y', type: 'number', min: -1, max: 1, def: 0 },
        { label: 'Z', key: 'view.up.z', type: 'number', min: -1, max: 1, def: 1 },
      ],
    ],
  },
];

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
  const ui = new UI(FORM_CONFIG, (full) => {
    const config = ui.get(full);
    if (full) {
      hashWatch.setJSON(config);
    }
    render(config);
  }, hashWatch.getJSON());

  document.body.appendChild(ui.form);

  hashWatch.onChange = () => {
    const config = hashWatch.getJSON();
    ui.set(config);
    render(ui.get(true));
  };
});
