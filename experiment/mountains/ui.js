'use strict';

const INPUT_TYPES = {
  'const': ({ value, fullValue = null }) => {
    return {
      dom: null,
      get: (full) => full ? fullValue ?? value : value,
      set: () => {},
    };
  },
  'number': ({ label, min = null, max = null, scale = 1 }, onInput, onChange) => {
    const input = document.createElement('input');
    if (min !== undefined && max !== undefined) {
      input.setAttribute('type', 'range');
    } else {
      input.setAttribute('type', 'number');
    }
    input.setAttribute('min', min);
    input.setAttribute('max', max);
    input.setAttribute('step', 'any');
    input.addEventListener('input', onInput);
    input.addEventListener('change', onChange);

    const l = document.createElement('label');
    l.appendChild(document.createTextNode(label + ' '));
    l.appendChild(input);

    return {
      dom: l,
      get: () => Number.parseFloat(input.value) * scale,
      set: (v) => { input.value = String(v / scale); },
    };
  },
  'boolean': ({ label }, _, onChange) => {
    const input = document.createElement('input');
    input.setAttribute('type', 'checkbox');
    input.addEventListener('change', onChange);

    const l = document.createElement('label');
    l.appendChild(input);
    l.appendChild(document.createTextNode(' ' + label));

    return {
      dom: l,
      get: () => input.checked,
      set: (v) => { input.checked = Boolean(v); },
    };
  },
};

class UI {
  constructor(config, callback, initial) {
    let tm = null;
    const configInput = () => {
      callback(false);
    };
    const configChange = () => {
      clearTimeout(tm);
      tm = setTimeout(() => callback(true), 0);
    };

    this.inputs = [];
    this.form = document.createElement('form');
    this.form.setAttribute('action', '#');
    for (const { title, rows } of config) {
      const fs = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.innerText = title;
      fs.appendChild(legend);
      for (const row of rows) {
        for (const { type, key, def, ...typeConfig } of row) {
          const { dom, get, set } = INPUT_TYPES[type](typeConfig, configInput, configChange);
          if (dom) {
            fs.appendChild(dom);
          }
          this.inputs.push({ key: key.split('.'), get, set, def });
        }
        fs.appendChild(document.createElement('br'));
      }
      this.form.appendChild(fs);
    }

    this.set(initial ?? {});
    configChange();
  }

  get(full) {
    const r = {};
    for (const o of this.inputs) {
      deepWrite(r, o.key, o.get(full) ?? o.def);
    }
    return r;
  }

  set(config) {
    for (const o of this.inputs) {
      o.set(deepRead(config, o.key) ?? o.def);
    }
  }
}
