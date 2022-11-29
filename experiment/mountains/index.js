'use strict';

// file:///Users/david/Projects/Raycast/experiment/mountains/index.html#{%22resolution%22:1,%22lightQuality%22:70,%22time%22:35,%22stencil%22:{%22trace%22:2.14601769911504},%22dust%22:{%22opacity%22:0.295941648230089,%22reflectivity%22:0.9},%22lights%22:[{%22pos%22:{%22x%22:0,%22y%22:-0.675,%22z%22:-2.234481631627984},%22col%22:{%22r%22:13.4285714285714,%22g%22:1.85185185185185,%22b%22:0}},{%22pos%22:{%22x%22:0,%22y%22:-0.675,%22z%22:-2.0937216220403227},%22col%22:{%22r%22:10,%22g%22:6.55006858710563,%22b%22:0}},{%22pos%22:{%22x%22:0,%22y%22:-0.675,%22z%22:-1.966851799785529},%22col%22:{%22r%22:1.57142857142857,%22g%22:8.19615912208505,%22b%22:1.57142857142857}},{%22pos%22:{%22x%22:0,%22y%22:-0.675,%22z%22:-1.8517781260777946},%22col%22:{%22r%22:0,%22g%22:6.55006858710562,%22b%22:10}},{%22pos%22:{%22x%22:0,%22y%22:-0.675,%22z%22:-1.746805305299614},%22col%22:{%22r%22:0,%22g%22:1.85185185185185,%22b%22:13.4285714285714}}],%22lightFollow%22:0.8,%22fog%22:0.552336836283186,%22grid%22:false,%22gamma%22:6.72704646017699,%22saturation%22:0.831650995575221,%22view%22:{%22fovy%22:0.6218459462961544,%22eyeSeparation%22:0,%22focusFollow%22:1,%22camera%22:{%22x%22:1.28733407079646,%22y%22:5,%22z%22:4.07909292035398},%22focus%22:{%22x%22:-0.110066371681416,%22y%22:1.09955752212389,%22z%22:1.41233407079646},%22up%22:{%22x%22:0,%22y%22:0,%22z%22:1}}}

// file:///Users/david/Projects/Raycast/experiment/mountains/index.html#{%22resolution%22:1,%22lightQuality%22:70,%22time%22:35,%22stencil%22:{%22trace%22:2.14601769911504},%22dust%22:{%22opacity%22:0.298534292035398,%22reflectivity%22:0.9},%22lights%22:[{%22pos%22:{%22x%22:0,%22y%22:-0.675,%22z%22:-2.234481631627984},%22col%22:{%22r%22:13.4285714285714,%22g%22:1.85185185185185,%22b%22:0}},{%22pos%22:{%22x%22:0,%22y%22:-0.675,%22z%22:-2.0937216220403227},%22col%22:{%22r%22:10,%22g%22:6.55006858710563,%22b%22:0}},{%22pos%22:{%22x%22:0,%22y%22:-0.675,%22z%22:-1.966851799785529},%22col%22:{%22r%22:1.57142857142857,%22g%22:8.19615912208505,%22b%22:1.57142857142857}},{%22pos%22:{%22x%22:0,%22y%22:-0.675,%22z%22:-1.8517781260777946},%22col%22:{%22r%22:0,%22g%22:6.55006858710562,%22b%22:10}},{%22pos%22:{%22x%22:0,%22y%22:-0.675,%22z%22:-1.746805305299614},%22col%22:{%22r%22:0,%22g%22:1.85185185185185,%22b%22:13.4285714285714}}],%22lightFollow%22:0.8,%22fog%22:0.552336836283186,%22grid%22:false,%22gamma%22:6.72704646017699,%22saturation%22:0.831650995575221,%22view%22:{%22fovy%22:2.1077167526573084,%22eyeSeparation%22:0,%22focusFollow%22:1,%22camera%22:{%22x%22:1.28733407079646,%22y%22:5,%22z%22:0.819275442477876},%22focus%22:{%22x%22:-2,%22y%22:2,%22z%22:0.991288716814159},%22up%22:{%22x%22:0,%22y%22:0,%22z%22:1}}}

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
        { label: 'Height', key: 'terrainHeight', type: 'number', min: 0, max: 5, def: 1.8 },
        { label: 'Large Scale Zoom', key: 'largeZoom', type: 'number', min: 0, max: 2, def: 0.17 },
        { label: 'Large Scale Height', key: 'largeHeight', type: 'number', min: 0, max: 2, def: 1.5 },
      ],
      [
        { label: 'Flatness', key: 'flatness', type: 'number', min: 0, max: 10, def: 4 },
        { label: 'Cliff Flatness', key: 'cliffFlatness', type: 'number', min: 0, max: 1, def: 0.4 },
        { label: 'Peak Flatness', key: 'peakFlatness', type: 'number', min: -0.5, max: 2, def: 0.1 },
      ],
    ],
  },
  {
    title: 'Water',
    rows: [
      [
        { label: 'Height', key: 'waterHeight', type: 'number', min: 0, max: 3, def: 0.25 },
      ],
      [
        { label: 'Ripple Zoom', key: 'ripple.zoom', type: 'number', min: 0, max: 400, def: 80 },
        { label: 'Ripple Height', key: 'ripple.height', type: 'number', min: 0, max: 0.1, def: 0.001 },
        { label: 'Ripple Shift X', key: 'ripple.shift.x', type: 'number', min: -10, max: 10, def: 0 },
        { label: 'Ripple Shift Y', key: 'ripple.shift.y', type: 'number', min: -10, max: 10, def: 0 },
      ],
    ],
  },
  {
    title: 'Sun',
    rows: [
      [
        { label: 'X', key: 'sun.x', type: 'number', min: -1, max: 1, def: -1 },
        { label: 'Y', key: 'sun.y', type: 'number', min: -1, max: 1, def: 0 },
        { label: 'Z', key: 'sun.z', type: 'number', min: -1, max: 1, def: 0.3 },
      ],
    ],
  },
  {
    title: 'Camera',
    rows: [
      [
        { label: 'X', key: 'view.camera.x', type: 'number', min: -5, max: 5, def: 0 },
        { label: 'Y', key: 'view.camera.y', type: 'number', min: -5, max: 5, def: 1.75 },
        { label: 'Z', key: 'view.camera.z', type: 'number', min: 0, max: 4, def: 2.5 },
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
        { label: 'Z', key: 'view.focus.z', type: 'number', min: 0, max: 2, def: 0 },
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
