'use strict';

class HashWatch {
  constructor(onChange) {
    this.onChange = onChange;
    this.skipHash = null;

    window.addEventListener('hashchange', this.handleChange.bind(this));
  }

  set(value) {
    const encoded = JSON.stringify(value).replace(/%/g, '%25');
    this.skipHash = encoded;
    document.location.hash = encoded;
  }

  get() {
    const raw = document.location.hash?.substr(1);
    if (!raw) {
      return undefined;
    }
    try {
      return JSON.parse(decodeURIComponent(raw));
    } catch (e) {
      return undefined;
    }
  }

  handleChange() {
    if (document.location.hash?.substr(1) === this.skipHash) {
      this.skipHash = null;
      return;
    }
    this.onChange?.(this.get());
  }
}
