'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('manifest válido e todos os arquivos referenciados existem', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'validate-manifest.js')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('options.html carrega common.js antes de options.js', () => {
  const html = require('node:fs').readFileSync(path.join(__dirname, '..', 'extension', 'options', 'options.html'), 'utf8');
  assert.ok(html.indexOf('../scripts/common.js') > -1);
  assert.ok(html.indexOf('../scripts/common.js') < html.indexOf('options.js'));
});
