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

function getLights() {
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
          z: angleToDistance(getValue(`light${i}a`) * DEG2RAD),
        },
        col,
      });
    }
  }
  return lights;
}

function setLights(lights) {
  for (let i = 1; i <= lights.length; ++i) {
    const light = lights[i - 1];
    document.getElementsByName(`light${i}`)[0].checked = true;
    setValue(`light${i}x`, light.pos.x);
    setValue(`light${i}y`, light.pos.y);
    setValue(`light${i}a`, distanceToAngle(light.pos.z) / DEG2RAD);
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
  updateLightUI();
}

function updateLightUI() {
  for (let i = 1; true; ++i) {
    const flag = document.getElementsByName(`light${i}`)[0];
    if (!flag) {
      break;
    }
    const r = flag.checked ? getValue(`light${i}r`) : 0;
    const g = flag.checked ? getValue(`light${i}g`) : 0;
    const b = flag.checked ? getValue(`light${i}b`) : 0;
    const sat = Math.max(r, g, b, 1.0);
    document.getElementById(`light${i}c`).style.backgroundColor =
      `rgb(${r * 255 / sat}, ${g * 255 / sat}, ${b * 255 / sat})`;
  }
}

function getLightCluster() {
  const exposure = getValue('lightCe');
  return {
    x: getValue('lightCx'),
    y: getValue('lightCy'),
    z1: angleToDistance(getValue('lightCa1') * DEG2RAD),
    z2: angleToDistance(getValue('lightCa2') * DEG2RAD),
    r: getValue('lightCr') * exposure,
    g: getValue('lightCg') * exposure,
    b: getValue('lightCb') * exposure,
    count: getValue('lightN'),
  };
}

function setLightCluster({ x, y, z1, z2, r, g, b, e, count }) {
  setValue('lightCx', x);
  setValue('lightCy', y);
  setValue('lightCa1', distanceToAngle(z1) / DEG2RAD);
  setValue('lightCa2', distanceToAngle(z2) / DEG2RAD);
  setValue('lightCr', r);
  setValue('lightCg', g);
  setValue('lightCb', b);
  setValue('lightCe', e);
  setValue('lightN', count);
}

function getView() {
  return {
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
  };
}

function setView(view) {
  setValue('fov', (view.fov ?? 60) / DEG2RAD);
  setValue('eyesep', view.eyeSeparation ?? 0);
  setValue('camerax', view.camera.x ?? 0);
  setValue('cameray', view.camera.y ?? 0);
  setValue('cameraz', view.camera.z ?? 0);
  setValue('focusx', view.focus.x ?? 0);
  setValue('focusy', view.focus.y ?? 0);
  setValue('focusz', view.focus.z ?? 0);
  setValue('upx', view.up.x ?? 0);
  setValue('upy', view.up.y ?? 0);
  setValue('upz', view.up.z ?? 1);
}

function getConfig(full) {
  const lights = getLights();

  return {
    resolution: full ? dpr : 1,
    lightQuality: full ? 70 : Math.ceil(100 / lights.length),
    time: getValue('time'),
    stencil: {
      frame: getValue('frame'),
      trace: getValue('trace'),
    },
    dust: {
      opacity: getValue('dustopacity'),
      reflectivity: getValue('dustreflectivity'),
    },
    lights,
    fog: getValue('fog'),
    grid: document.getElementsByName('grid')[0].checked,
    view: getView(),
  };
}

function setConfig(config) {
  setLights(config.lights ?? []);
  setLightCluster(lightsToCluster(config.lights ?? []));

  setValue('time', config.time ?? 0);
  setValue('frame', config.stencil?.frame ?? 0);
  setValue('trace', config.stencil?.trace ?? 1);
  setValue('dustopacity', config.dust?.opacity ?? 0);
  setValue('dustreflectivity', config.dust?.reflectivity ?? 0);
  setValue('fog', config.fog ?? 0);
  document.getElementsByName('grid')[0].checked = config.grid;
  setView(config.view ?? {});
}

class UI {
  constructor(callback, initial) {
    let tm = null;
    const configInput = () => {
      updateLightUI();
      callback(false);
    };
    const configChange = () => {
      updateLightUI();
      clearTimeout(tm);
      tm = setTimeout(() => callback(true), 0);
    };

    const lightGroupInput = () => {
      setLights(clusterToLights(getLightCluster()));
      configInput();
    };
    const lightGroupChange = () => {
      setLights(clusterToLights(getLightCluster()));
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

    if (initial) {
      setConfig(initial);
      configChange();
    } else {
      lightGroupChange();
    }
  }

  get(full) {
    return getConfig(full);
  }

  set(config) {
    setConfig(config);
  }
}
