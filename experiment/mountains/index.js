'use strict';

const dpr = window.devicePixelRatio;
window.devicePixelRatio = 1;

const FORM_CONFIG = [
  {
    title: 'Scene',
    rows: [
      [
        { key: 'resolution', type: 'const', value: 0.5, fullValue: 1 },
        { label: 'Colorspace', key: 'colorspace', type: 'option', options: ['srgb', 'display-p3'], def: 'display-p3' },
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
        { label: 'Fog', key: 'waterFog', type: 'number', min: 0, max: 20, def: 12 },
      ],
      [
        { label: 'Ripple Zoom', key: 'ripple.zoom', type: 'number', min: 0, max: 400, def: 250 },
        { label: 'Ripple Height', key: 'ripple.height', type: 'number', min: 0, max: 0.002, def: 0.0002 },
        { label: 'Ripple Shift X', key: 'ripple.shift.x', type: 'number', min: -10, max: 10, def: 0 },
        { label: 'Ripple Shift Y', key: 'ripple.shift.y', type: 'number', min: -10, max: 10, def: 0 },
      ],
      [
        { label: 'Ripple 2 Zoom', key: 'ripple2.zoom', type: 'number', min: 0, max: 20, def: 8 },
        { label: 'Ripple 2 Height', key: 'ripple2.height', type: 'number', min: 0, max: 0.01, def: 0.003 },
        { label: 'Ripple 2 Shift X', key: 'ripple2.shift.x', type: 'number', min: -10, max: 10, def: 0 },
        { label: 'Ripple 2 Shift Y', key: 'ripple2.shift.y', type: 'number', min: -10, max: 10, def: 0 },
      ],
      [
        { label: 'Wave Distance', key: 'wave.distance', type: 'number', min: 0.02, max: 1, def: 0.07 },
        { label: 'Wave Height', key: 'wave.height', type: 'number', min: 0, max: 0.002, def: 0.0004 },
        { label: 'Wave Frequency', key: 'wave.frequency', type: 'number', min: 0, max: 400, def: 70 },
        { label: 'Wave Phase', key: 'wave.phase', type: 'number', min: -10, max: 10, def: 0 },
      ],
    ],
  },
  {
    title: 'Snow',
    rows: [
      [
        { label: 'Low Height', key: 'snow.low', type: 'number', min: 0, max: 3, def: 0.81 },
        { label: 'High Height', key: 'snow.high', type: 'number', min: 0, max: 3, def: 0.9 },
        { label: 'Slope Falloff', key: 'snow.slope', type: 'number', min: -1, max: 1, def: 0.3 },
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
        { label: 'Shadow blur', key: 'shadowBlur', type: 'number', min: 0, max: 0.5, def: 0.15 },
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
