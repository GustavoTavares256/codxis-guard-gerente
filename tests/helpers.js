'use strict';
const path = require('node:path');

/** Carrega common.js com um `chrome.storage.local` falso em memória. */
function loadCX() {
  const store = {};
  globalThis.chrome = {
    storage: {
      local: {
        get: async (k) => (k in store ? { [k]: store[k] } : {}),
        set: async (o) => { Object.assign(store, o); }
      }
    }
  };
  const file = path.join(__dirname, '..', 'extension', 'scripts', 'common.js');
  delete require.cache[require.resolve(file)];
  return { CX: require(file), store };
}

module.exports = { loadCX };
