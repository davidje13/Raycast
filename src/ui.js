'use strict';

const dpr = window.devicePixelRatio;
window.devicePixelRatio = 1;

const DEG2RAD = Math.PI / 180;

function getValue(name) {
  const o = document.getElementsByName(name)[0];
  return Number.parseFloat(o.value);
}

function setValue(name, v) {
  const o = document.getElementsByName(name)[0];
  return o.value = v;
}

function setLights(lights) {
  for (let i = 1; i <= lights.length; ++i) {
    const light = lights[i - 1];
    document.getElementsByName(`light${i}`)[0].checked = true;
    setValue(`light${i}x`, light.pos.x);
    setValue(`light${i}y`, light.pos.y);
    setValue(`light${i}z`, light.pos.z);
    setValue(`light${i}r`, light.col.r);
    setValue(`light${i}g`, light.col.g);
    setValue(`light${i}b`, light.col.b);
  }
  for (let i = lights.length + 1; true; ++i) {
    const flag = document.getElementsByName(`light${i}`)[0];
    if (!flag) {
      break;
    }
    flag.checked = false;
  }
}

function updateLightCluster() {
  const exposure = getValue('lightCe');

  setLights(lightConfigFromCluster({
    x: getValue('lightCx'),
    y: getValue('lightCy'),
    z1: getValue('lightCz1'),
    z2: getValue('lightCz2'),
    r: getValue('lightCr') * exposure,
    g: getValue('lightCg') * exposure,
    b: getValue('lightCb') * exposure,
    count: getValue('lightN'),
  }));
}

function getConfig(full) {
  const lights = [];
  for (let i = 1; true; ++i) {
    const flag = document.getElementsByName(`light${i}`)[0];
    if (!flag) {
      break;
    }
    if (flag.checked) {
      const col = {
        r: getValue(`light${i}r`),
        g: getValue(`light${i}g`),
        b: getValue(`light${i}b`),
      };
      lights.push({
        pos: {
          x: getValue(`light${i}x`),
          y: getValue(`light${i}y`),
          z: Math.max(-10000, -1 / Math.tan(getValue(`light${i}z`) * DEG2RAD)),
        },
        col,
      });
      const maxCol = Math.max(col.r, col.g, col.b, 1.0);
      document.getElementById(`light${i}c`).style.backgroundColor = `rgb(${col.r * 255 / maxCol}, ${col.g * 255 / maxCol}, ${col.b * 255 / maxCol})`;
    } else {
      document.getElementById(`light${i}c`).style.backgroundColor = '#000000';
    }
  }

  return {
    resolution: full ? dpr : 1,
    lightQuality: full ? 300 : 100,
    time: getValue('time'),
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
  const configInput = () => callback(getConfig(false));
  const configChange = () => {
    clearTimeout(tm);
    tm = setTimeout(() => callback(getConfig(true)), 0);
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
