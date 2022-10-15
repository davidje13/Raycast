'use strict';

const dpr = window.devicePixelRatio;
window.devicePixelRatio = 1;

const LIGHT_PROPORTIONS = [
  { r: 0.55, g: 0.00, b: 0.00, a: 0.00 },
  { r: 0.45, g: 0.30, b: 0.00, a: 0.25 },
  { r: 0.00, g: 0.40, b: 0.00, a: 0.50 },
  { r: 0.00, g: 0.30, b: 0.45, a: 0.75 },
  { r: 0.00, g: 0.00, b: 0.55, a: 1.00 },
];
const DEG2RAD = Math.PI / 180;

function getValue(name) {
  const o = document.getElementsByName(name)[0];
  return Number.parseFloat(o.value);
}

function setValue(name, v) {
  const o = document.getElementsByName(name)[0];
  return o.value = v;
}

function updateLightCluster() {
  const x = getValue('lightCx');
  const y = getValue('lightCy');
  const z1 = getValue('lightCz1');
  const z2 = getValue('lightCz2');
  const exposure = getValue('lightCe');
  const r = getValue('lightCr') * exposure;
  const g = getValue('lightCg') * exposure;
  const b = getValue('lightCb') * exposure;

  if (z1 === z2) {
    document.getElementsByName('light1')[0].checked = true;
    setValue('light1x', x);
    setValue('light1y', y);
    setValue('light1z', z1);
    setValue('light1r', r);
    setValue('light1g', g);
    setValue('light1b', b);
    for (let i = 2; i <= LIGHT_PROPORTIONS.length; ++i) {
      document.getElementsByName(`light${i}`)[0].checked = false;
    }
    return;
  }

  for (let i = 1; i <= LIGHT_PROPORTIONS.length; ++i) {
    document.getElementsByName(`light${i}`)[0].checked = true;
    const props = LIGHT_PROPORTIONS[i - 1];

    setValue(`light${i}x`, x);
    setValue(`light${i}y`, y);
    setValue(`light${i}z`, (z2 - z1) * props.a + z1);
    setValue(`light${i}r`, r * props.r);
    setValue(`light${i}g`, g * props.g);
    setValue(`light${i}b`, b * props.b);
  }
}

function getConfig(full) {
  const lights = [];
  for (let i = 1; i <= LIGHT_PROPORTIONS.length; ++i) {
    if (document.getElementsByName(`light${i}`)[0].checked) {
      lights.push({
        x: getValue(`light${i}x`),
        y: getValue(`light${i}y`),
        z: Math.max(-10000, -1 / Math.tan(getValue(`light${i}z`) * DEG2RAD)),
        r: getValue(`light${i}r`),
        g: getValue(`light${i}g`),
        b: getValue(`light${i}b`),
      });
    }
  }

  return {
    resolution: full ? dpr : 1,
    lightQuality: full ? 1500 : 300,
    stencil: {
      frame: getValue('frame'),
      trace: getValue('trace'),
    },
    lights,
    fog: getValue('fog'),
    view: {
      fov: getValue('fov') * DEG2RAD,
      eyeSeparation: getValue('eyesep'),
      camera: {
        x: getValue('camerax'),
        y: getValue('cameray'),
        z: getValue('cameraz'),
      },
      focus: {
        x: getValue('focusx'),
        y: getValue('focusy'),
        z: getValue('focusz'),
      },
      up: {
        x: getValue('upx'),
        y: getValue('upy'),
        z: getValue('upz'),
      },
    },
  };
}

function buildUI(callback) {
  let tm = null;
  const configInput = () => callback(getConfig(false), false);
  const configChange = () => {
    clearTimeout(tm);
    tm = setTimeout(() => callback(getConfig(true), true), 0);
  };

  const lightGroupInput = () => {
    updateLightCluster();
    configInput();
  };
  const lightGroupChange = () => {
    updateLightCluster();
    configChange();
  };

  for (const i of document.getElementsByTagName('input')) {
    switch (i.dataset['target']) {
      case 'light-group':
        i.addEventListener('input', lightGroupInput);
        i.addEventListener('change', lightGroupChange);
        break;
      default:
        i.addEventListener('input', configInput);
        i.addEventListener('change', configChange);
    }
  }

  lightGroupChange();
}
