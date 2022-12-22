'use strict';

const INPUT_TYPES = {
  'const': ({ value, fullValue = null }) => {
    return {
      dom: null,
      get: (full) => full ? fullValue ?? value : value,
      set: () => {},
    };
  },
  'button': ({ label, eventType }, onInput, onChange, dispatchEvent) => {
    const button = document.createElement('button');
    button.setAttribute('type', 'button');
    button.addEventListener('click', () => {
      dispatchEvent(new CustomEvent(eventType, { detail: { button } }));
    });
    button.appendChild(document.createTextNode(label));

    return { dom: button };
  },
  'option': ({ label, options }, _, onChange) => {
    const select = document.createElement('select');
    const labels = options.map((o) => (typeof o === 'string' ? o : o.label));
    const values = options.map((o) => (typeof o === 'string' ? o : o.value));
    for (const label of labels) {
      const opt = document.createElement('option');
      opt.appendChild(document.createTextNode(label));
      select.appendChild(opt);
    }
    select.addEventListener('change', onChange);

    const l = document.createElement('label');
    l.appendChild(document.createTextNode(label + ' '));
    l.appendChild(select);

    return {
      dom: l,
      get: () => values[select.selectedIndex],
      set: (v) => { select.selectedIndex = values.indexOf(v); },
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
      mapDefault: (v) => v * scale,
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

class UI extends EventTarget {
  constructor(config, callback, initial) {
    super();
    let tm = null;
    const configInput = () => {
      callback(false);
    };
    const configChange = () => {
      clearTimeout(tm);
      tm = setTimeout(() => callback(true), 0);
    };
    const dispatchEvent = this.dispatchEvent.bind(this);

    this.inputs = [];
    this.form = document.createElement('form');
    this.form.setAttribute('action', '#');
    for (const { title, rows } of config) {
      const fs = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.appendChild(document.createTextNode(title));
      fs.appendChild(legend);
      for (const row of rows) {
        for (const { type, key, def, ...typeConfig } of row) {
          const { dom, get, set, mapDefault } = INPUT_TYPES[type](
            typeConfig,
            configInput,
            configChange,
            dispatchEvent,
          );
          if (dom) {
            fs.appendChild(dom);
            fs.appendChild(document.createTextNode(' '));
          }
          if (set || get) {
            this.inputs.push({
              key: key.split('.'),
              get,
              set,
              def: mapDefault?.(def) ?? def,
            });
          }
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
