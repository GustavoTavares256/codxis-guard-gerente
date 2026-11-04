'use strict';
// Valida o manifest e se todos os arquivos referenciados existem.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'extension');
const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const refs = [
  m.background?.service_worker,
  m.options_ui?.page,
  ...(m.content_scripts || []).flatMap((c) => c.js || [])
].filter(Boolean);
const missing = refs.filter((f) => !fs.existsSync(path.join(root, f)));
if (m.manifest_version !== 3) missing.push('manifest_version deve ser 3');
if (missing.length) { console.error('Problemas:', missing); process.exit(1); }
console.log('manifest OK —', refs.length, 'arquivos referenciados');
