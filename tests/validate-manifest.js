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
const icons = Object.values(m.icons || {});
refs.push(...icons, ...Object.values((m.action && m.action.default_icon) || {}));
const missing = refs.filter((f) => !fs.existsSync(path.join(root, f)));
if (!icons.length) missing.push('manifest sem "icons" (a Chrome Web Store exige o ícone 128)');
if (!(m.icons && m.icons['128'])) missing.push('falta icons["128"]');
if ((m.name || '').length > 45) missing.push('name > 45 caracteres (limite da loja)');
if ((m.description || '').length > 132) missing.push('description > 132 caracteres (limite da loja)');
if (m.manifest_version !== 3) missing.push('manifest_version deve ser 3');
if (missing.length) { console.error('Problemas:', missing); process.exit(1); }
console.log('manifest OK —', refs.length, 'arquivos referenciados');
