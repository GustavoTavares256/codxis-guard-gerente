const $ = (id) => document.getElementById(id);
const show = (id, on = true) => $(id).classList.toggle('hidden', !on);
const say = (id, text, ok) => { const e = $(id); e.textContent = text; e.className = 'msg ' + (ok ? 'ok' : 'bad'); };
const FIELDS = ['company', 'screenRegex', 'removeRegex', 'cancelRegex', 'priceRegex', 'priceFieldRegex', 'removeKeys', 'cancelKeys'];

async function init() {
  const adm = await CX.get('adminCred');
  show('setup', !adm); show('login', !!adm);
}

$('setupBtn').onclick = async () => {
  const a = $('setupA').value;
  if (a.length < 6) return say('setupMsg', 'Mínimo 6 caracteres.');
  if (a !== $('setupB').value) return say('setupMsg', 'As senhas não conferem.');
  await CX.set('adminCred', await CX.makeCred(a));
  unlock();
};

async function doLogin() {
  const l = await CX.getLock('admin');
  const left = Math.ceil((l.until - Date.now()) / 1000);
  if (left > 0) return say('loginMsg', `Bloqueado. Aguarde ${left}s.`);
  const pwd = $('loginPwd').value; $('loginPwd').value = '';
  if (await CX.verify(pwd, await CX.get('adminCred'))) { await CX.clearFails('admin'); return unlock(); }
  const r = await CX.registerFail('admin', 5, 60000);
  say('loginMsg', r.until > Date.now() ? 'Senha incorreta. Bloqueado por 1 minuto.' : 'Senha incorreta.');
}
$('loginBtn').onclick = doLogin;
$('loginPwd').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

async function unlock() {
  show('setup', false); show('login', false); show('main', true);
  const s = await CX.getSettings();
  FIELDS.forEach((f) => ($(f).value = s[f]));
  $('debug').checked = !!s.debug;
  $('mgrStatus').textContent = (await CX.get('managerCred')) ? 'Senha do gerente: cadastrada.' : 'Senha do gerente: NÃO cadastrada (todas as ações protegidas serão negadas).';
  renderLog();
}

$('mgrBtn').onclick = async () => {
  const a = $('mgrA').value;
  if (a.length < 4) return say('mgrMsg', 'Mínimo 4 caracteres.');
  if (a !== $('mgrB').value) return say('mgrMsg', 'As senhas não conferem.');
  await CX.set('managerCred', await CX.makeCred(a));
  await CX.clearFails('manager');
  $('mgrA').value = $('mgrB').value = '';
  say('mgrMsg', 'Senha do gerente salva.', true);
  $('mgrStatus').textContent = 'Senha do gerente: cadastrada.';
};

$('admBtn').onclick = async () => {
  if (!(await CX.verify($('admOld').value, await CX.get('adminCred')))) return say('admMsg', 'Senha atual incorreta.');
  if ($('admNew').value.length < 6) return say('admMsg', 'Mínimo 6 caracteres.');
  await CX.set('adminCred', await CX.makeCred($('admNew').value));
  $('admOld').value = $('admNew').value = '';
  say('admMsg', 'Senha de administrador alterada.', true);
};

$('cfgBtn').onclick = async () => {
  const s = { debug: $('debug').checked };
  FIELDS.forEach((f) => (s[f] = $(f).value.trim()));
  for (const f of ['screenRegex', 'removeRegex', 'cancelRegex', 'priceRegex', 'priceFieldRegex']) {
    try { new RegExp(s[f], 'i'); } catch (e) { return say('cfgMsg', 'Regex inválida em ' + f, false); }
  }
  await CX.set('settings', s);
  say('cfgMsg', 'Configuração salva (já vale nas abas abertas).', true);
};
$('cfgReset').onclick = async () => {
  await CX.set('settings', { ...CX.DEFAULTS });
  unlock(); say('cfgMsg', 'Padrões restaurados.', true);
};

/* ---- Log ---- */
async function getLog() { return ((await CX.get('authLog')) || []).slice().reverse(); }
async function renderLog() {
  const body = $('logBody'); body.innerHTML = '';
  for (const r of await getLog()) {
    const tr = document.createElement('tr');
    const cells = [new Date(r.ts).toLocaleString('pt-BR'), r.acao, r.produto, r.valor, r.resultado, r.detalhe];
    cells.forEach((c, i) => {
      const td = document.createElement('td'); td.textContent = c || '';
      if (i === 4) td.className = c === 'autorizado' ? 'aut' : 'neg';
      tr.appendChild(td);
    });
    body.appendChild(tr);
  }
}
$('refreshBtn').onclick = renderLog;
$('clearBtn').onclick = async () => { if (confirm('Apagar todo o log?')) { await CX.set('authLog', []); renderLog(); } };
$('csvBtn').onclick = async () => {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Data/hora', 'Ação', 'Produto', 'Valor', 'Resultado', 'Detalhe'].map(q).join(';')];
  for (const r of await getLog()) lines.push([new Date(r.ts).toLocaleString('pt-BR'), r.acao, r.produto, r.valor, r.resultado, r.detalhe].map(q).join(';'));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `autorizacoes-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
};

init();
