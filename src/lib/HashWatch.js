'use strict';

class HashWatch {
  constructor(onChange) {
    this.onChange = onChange;
    this.skipHash = null;

    window.addEventListener('hashchange', this.handleChange.bind(this));
  }

  set(value) {
    this.skipHash = value;
    document.location.hash = value.replace(/%/g, '%25');
  }

  setJSON(value) {
    this.set(JSON.stringify(value));
  }

  get() {
    const raw = document.location.hash?.substr(1);
    if (!raw) {
      return undefined;
    }
    return decodeURIComponent(raw);
  }

  getJSON() {
    try {
      return JSON.parse(this.get());
    } catch (e) {
      return undefined;
    }
  }

  handleChange() {
    if (this.get() === this.skipHash) {
      this.skipHash = null;
      return;
    }
    this.onChange?.();
  }
}
