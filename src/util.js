'use strict';

function deepEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  const arr = Array.isArray(a);
  if (arr !== Array.isArray(b)) {
    return false;
  }
  if (arr) {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ks = Object.keys(a);
  if (ks.length !== Object.keys(b).length) {
    return false;
  }
  return ks.every((k) => deepEqual(a[k], b[k]));
}
