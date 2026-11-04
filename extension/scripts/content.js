/* Codxis Guard - content script */
(() => {
  'use strict';
  const TAG = '[CX-Guard]';
  let cfg = { ...CX.DEFAULTS };
  let rxRemove = null, rxCancel = null, rxScreen = null, rxPrice = null, rxPriceField = null, rxDiscount = null;
  const priceOk = new WeakSet(); // campos de preço já autorizados (até perder o foco)
  let keysRemove = new Set(), keysCancel = new Set();
  let bypass = false;
  let currentHost = null; // host do modal aberto (null = fechado)
  let active = false, lastCheck = 0;

  const { norm, mkRx, normCombo, comboOf } = CX;

  function applyCfg(s) {
    cfg = { ...CX.DEFAULTS, ...(s || {}) };
    rxRemove = mkRx(cfg.removeRegex); rxCancel = mkRx(cfg.cancelRegex); rxScreen = mkRx(cfg.screenRegex);
    rxPrice = mkRx(cfg.priceRegex); rxPriceField = mkRx(cfg.priceFieldRegex); rxDiscount = mkRx(cfg.discountDialogRegex);
    const toSet = (str) => new Set(str.split(',').map((x) => x.trim()).filter(Boolean).map(normCombo));
    keysRemove = toSet(cfg.removeKeys || ''); keysCancel = toSet(cfg.cancelKeys || '');
    lastCheck = 0;
  }
  CX.get('settings').then(applyCfg);
  chrome.storage.onChanged.addListener((ch) => { if (ch.settings) applyCfg(ch.settings.newValue); });

  /* ---------- Detecção de tela / empresa ---------- */
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  function checkActive() {
    lastCheck = Date.now();
    if (!document.body) { active = false; return; }
    const company = norm(cfg.company);
    // O nome da empresa aparece no painel, mas não na tela do PDV. Lembramos (por aba) que ela
    // foi vista; a lista do parceiro (que mostra todas as empresas) zera essa marca.
    const KEY = 'cx_company_seen';
    let companyOk = !company;
    if (!companyOk) {
      try {
        if (/indexParceiroPrincipal/i.test(location.href)) sessionStorage.removeItem(KEY);
        else if (norm(document.body.textContent).includes(company)) sessionStorage.setItem(KEY, company);
        companyOk = sessionStorage.getItem(KEY) === company;
      } catch (e) { companyOk = norm(document.body.textContent).includes(company); }
    }
    const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,.breadcrumb,[class*=title],[class*=titulo]')]
      .filter(visible).map((e) => (e.textContent || '').slice(0, 200)).join(' ');
    const screenText = norm(location.href + ' ' + document.title + ' ' + heads);
    const screenOk = !rxScreen || rxScreen.test(screenText);
    active = companyOk && screenOk;
  }
  const isActive = () => { if (Date.now() - lastCheck > 1500) checkActive(); return active; };

  let t = null;
  const schedule = () => { clearTimeout(t); t = setTimeout(checkActive, 400); };
  const startObserver = () => {
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    window.addEventListener('hashchange', schedule);
    window.addEventListener('popstate', schedule);
    schedule();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver); else startObserver();

  /* ---------- Classificação de elementos ---------- */
  function describe(el) {
    const cls = (n) => n.getAttribute && (n.getAttribute('class') || '');
    const parts = [
      el.innerText && el.innerText.length <= 40 ? el.innerText : '',
      el.getAttribute('title'), el.getAttribute('aria-label'), el.getAttribute('data-original-title'),
      el.getAttribute('data-tooltip'), el.getAttribute('mattooltip'), el.id, cls(el), el.getAttribute('name'),
      el.getAttribute('value'), el.getAttribute('href')
    ];
    if (el.querySelectorAll('*').length <= 6) {
      el.querySelectorAll('i,svg,use,mat-icon,span,img').forEach((c) => {
        parts.push(cls(c), c.getAttribute('href'), c.getAttribute('xlink:href'), c.getAttribute('alt'), c.tagName === 'MAT-ICON' ? c.textContent : '');
      });
    }
    return parts.filter(Boolean).join(' ');
  }
  /* Modal "Autorização – Desconto maior que o limite do vendedor" do próprio Codxis */
  const CONFIRM = /^(confirmar|autorizar|ok)$/;
  function discountDialog(el) {
    const dlg = el && el.closest && el.closest('.ui-dialog,[role=dialog]');
    if (!dlg || !visible(dlg) || !rxDiscount) return null;
    return rxDiscount.test(norm(dlg.id + ' ' + (dlg.innerText || '').slice(0, 300))) ? dlg : null;
  }
  function discountHit(start) {
    const btn = start && start.closest && start.closest('button,a,input[type=submit],input[type=button]');
    if (!btn || !discountDialog(btn) || !CONFIRM.test(norm(btn.innerText || btn.value))) return null;
    return { type: 'discount', el: btn };
  }

  function findHit(start) {
    let el = start && start.nodeType === 1 ? start : start && start.parentElement;
    for (let i = 0; el && i < 5 && el !== document.body; i++, el = el.parentElement) {
      if (/^(TR|LI|TABLE|FORM|UL|TBODY)$/.test(el.tagName)) break;
      const d = norm(describe(el));
      if (!d) continue;
      if (rxCancel && rxCancel.test(d)) return { type: 'cancel', el };
      if (rxRemove && rxRemove.test(d)) return { type: 'remove', el };
      if (rxPrice && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && rxPrice.test(d)) return { type: 'price', el };
    }
    return null;
  }

  /* ---------- Leitura de produto / valor ---------- */
  const MONEY = /\d{1,3}(?:\.\d{3})*,\d{2}/;
  function rowInfo(el) {
    const row = el && el.closest && el.closest('tr,li,[role=row],mat-row,[class*=item],[class*=row]');
    if (!row) return { product: '', value: '' };
    const cells = [...row.querySelectorAll('td,[role=cell],mat-cell')].map((c) => c.innerText.trim()).filter(Boolean);
    const texts = cells.length ? cells : row.innerText.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const product = texts.find((x) => x.length > 2 && !/^[\d.,\sR$%xX]+$/.test(x)) || '';
    const vals = texts.filter((x) => MONEY.test(x));
    return { product: product.slice(0, 120), value: vals.length ? vals[vals.length - 1] : '' };
  }
  function saleTotal() {
    for (const e of document.querySelectorAll('[class*=total],[id*=total]')) {
      if (!visible(e)) continue;
      const m = (e.innerText || '').match(MONEY);
      if (m) return 'R$ ' + m[0];
    }
    return '';
  }
  function infoFor(type, el) {
    if (type === 'cancel') return { product: '', value: saleTotal() };
    if (type === 'discount') {
      const i = document.querySelector('input[id$="descontoCurrency_input"]');
      return { product: i && i.value ? 'Desconto ' + i.value : '', value: '' };
    }
    if (type === 'price' && el && el.tagName === 'INPUT') {
      const d = document.querySelector('input[id$="consultaDescricao2_input"]');
      return { product: (d && d.value) || '', value: el.value ? 'R$ ' + el.value : '' };
    }
    let r = rowInfo(el);
    if (!r.product) { const sel = document.querySelector('tr.selected,tr.active,[class*=selected]'); if (sel) r = rowInfo(sel.firstElementChild || sel); }
    return r;
  }

  /* ---------- Modal ---------- */
  const LABEL = { remove: 'Remoção de item', cancel: 'Cancelamento de venda', price: 'Alteração de preço', discount: 'Desconto acima do limite' };
  const LOCKKEY = 'manager';

  function askPassword(type, info) {
    return new Promise((resolve) => {
      const prevFocus = document.activeElement;
      const host = document.createElement('div');
      host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
      const root = host.attachShadow({ mode: 'closed' });
      root.innerHTML = `
        <style>
          *{box-sizing:border-box;font-family:Segoe UI,Roboto,Arial,sans-serif}
          .bg{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center}
          .box{background:#fff;width:380px;max-width:92vw;border-radius:10px;box-shadow:0 20px 50px rgba(0,0,0,.35);padding:22px}
          h2{margin:0 0 4px;font-size:18px;color:#0f172a}
          .sub{margin:0 0 14px;font-size:13px;color:#475569}
          .info{background:#f1f5f9;border-radius:6px;padding:8px 10px;font-size:13px;color:#0f172a;margin-bottom:14px;word-break:break-word}
          .info:empty{display:none}
          input{width:100%;padding:10px 12px;font-size:16px;border:1px solid #cbd5e1;border-radius:6px;outline:none}
          input:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.2)}
          input:disabled{background:#f1f5f9}
          .err{min-height:18px;margin:8px 0 0;font-size:13px;color:#b91c1c}
          .row{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
          button{padding:9px 16px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;font-size:14px;cursor:pointer}
          button.ok{background:#2563eb;border-color:#2563eb;color:#fff}
          button:disabled{opacity:.5;cursor:not-allowed}
        </style>
        <div class="bg"><div class="box" role="dialog" aria-modal="true">
          <h2>Autorização do gerente</h2>
          <p class="sub"></p><div class="info"></div>
          <input type="password" autocomplete="new-password" placeholder="Senha do gerente" />
          <p class="err"></p>
          <div class="row"><button class="cancel">Cancelar (Esc)</button><button class="ok">Autorizar (Enter)</button></div>
        </div></div>`;
      const $ = (s) => root.querySelector(s);
      $('.sub').textContent = LABEL[type] + ' — digite a senha do gerente para continuar.';
      $('.info').textContent = [info.product, info.value].filter(Boolean).join('  •  ');
      const input = $('input'), err = $('.err'), okBtn = $('.ok');
      let timer = null, done = false;

      const finish = (ok) => {
        if (done) return; done = true;
        clearInterval(timer); host.remove(); currentHost = null;
        try { prevFocus && prevFocus.focus && prevFocus.focus(); } catch (e) { /* ignore */ }
        resolve(ok);
      };
      const record = (result, detalhe) => CX.addLog({ acao: LABEL[type], produto: info.product, valor: info.value, resultado: result, detalhe: detalhe || '' });

      async function refreshLock() {
        const l = await CX.getLock(LOCKKEY);
        const left = Math.ceil((l.until - Date.now()) / 1000);
        const locked = left > 0;
        input.disabled = okBtn.disabled = locked;
        if (locked) err.textContent = `Bloqueado por tentativas incorretas. Aguarde ${left}s.`;
        else if (input.disabled === false && err.textContent.startsWith('Bloqueado')) { err.textContent = ''; input.focus(); }
        return locked;
      }
      async function confirm() {
        if (await refreshLock()) return;
        const cred = await CX.get('managerCred');
        if (!cred) { err.textContent = 'Senha do gerente não cadastrada. Configure nas opções da extensão.'; return; }
        const pwd = input.value; input.value = '';
        if (await CX.verify(pwd, cred)) { await CX.clearFails(LOCKKEY); await record('autorizado'); finish(true); return; }
        const l = await CX.registerFail(LOCKKEY);
        await record('negado', 'senha incorreta');
        err.textContent = l.until > Date.now() ? 'Senha incorreta. Bloqueado por 1 minuto.' : 'Senha incorreta.';
        await refreshLock(); input.focus();
      }
      const cancel = async () => { await record('negado', 'cancelado pelo operador'); finish(false); };

      okBtn.addEventListener('click', confirm);
      $('.cancel').addEventListener('click', cancel);
      host.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); confirm(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      });
      host.addEventListener('keyup', (e) => e.stopPropagation());
      host.addEventListener('keypress', (e) => e.stopPropagation());
      input.addEventListener('blur', () => setTimeout(() => { if (!done && !input.disabled) input.focus(); }, 0));

      currentHost = host;
      (document.body || document.documentElement).appendChild(host);
      input.focus();
      refreshLock();
      timer = setInterval(refreshLock, 1000);
    });
  }

  /* ---------- Interceptação ---------- */
  const inHost = (e) => currentHost && e.composedPath().includes(currentHost);

  document.addEventListener('click', (e) => {
    if (bypass || !e.isTrusted || inHost(e)) return;
    if (currentHost) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    const origin = e.composedPath()[0] || e.target;
    if (cfg.debug) console.log(TAG, 'click', { ativo: isActive(), alvo: origin, descricao: origin && origin.nodeType === 1 ? describe(origin) : '' });
    if (!isActive()) return;
    const hit = discountHit(origin) || findHit(origin);
    if (!hit) return;
    e.preventDefault(); e.stopImmediatePropagation();
    askPassword(hit.type, infoFor(hit.type, hit.el)).then((ok) => {
      if (!ok) return;
      bypass = true;
      try { hit.el.click(); } finally { bypass = false; }
    });
  }, true);

  /* Edição do campo de preço unitário: pede a senha antes de aceitar digitação/colagem/exclusão. */
  const isPriceField = (el) => !!(el && el.tagName === 'INPUT' && rxPriceField &&
    rxPriceField.test(norm([el.id, el.name, el.getAttribute('aria-label'), el.placeholder].filter(Boolean).join(' '))));
  function guardPriceEdit(e) {
    if (bypass || !e.isTrusted || inHost(e)) return;
    const el = e.target;
    if (!isPriceField(el) || el.readOnly || el.disabled) return;
    if (currentHost) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (!isActive() || priceOk.has(el)) return;
    if (e.type === 'keydown') {
      const edits = e.key.length === 1 ? !(e.ctrlKey || e.metaKey) || /^[vx]$/i.test(e.key) : /^(Backspace|Delete)$/.test(e.key);
      if (!edits) return; // Tab, setas, F-keys etc. não alteram o valor
    }
    e.preventDefault(); e.stopImmediatePropagation();
    askPassword('price', infoFor('price', el)).then((ok) => {
      if (!ok) return;
      priceOk.add(el);
      try { el.focus(); el.select && el.select(); } catch (err) { /* ignore */ }
    });
  }
  ['keydown', 'beforeinput', 'paste', 'cut', 'drop'].forEach((t) => document.addEventListener(t, guardPriceEdit, true));
  document.addEventListener('focusout', (e) => priceOk.delete(e.target), true);

  // Enter na senha do modal de desconto também confirma: exige a senha da extensão antes.
  window.addEventListener('keydown', (e) => {
    if (bypass || !e.isTrusted || inHost(e) || e.key !== 'Enter' || currentHost) return;
    const dlg = discountDialog(e.target);
    if (!dlg || !isActive()) return;
    const btn = [...dlg.querySelectorAll('button,input[type=submit]')].find((b) => CONFIRM.test(norm(b.innerText || b.value)));
    if (!btn) return;
    e.preventDefault(); e.stopImmediatePropagation();
    askPassword('discount', infoFor('discount', btn)).then((ok) => {
      if (!ok) return;
      bypass = true;
      try { btn.click(); } finally { bypass = false; }
    });
  }, true);

  window.addEventListener('keydown', (e) => {
    if (bypass || !e.isTrusted || inHost(e)) return;
    if (currentHost) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (!e.key) return;
    const combo = comboOf(e);
    if (cfg.debug && !['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) console.log(TAG, 'tecla', combo, { ativo: isActive() });
    const type = keysRemove.has(combo) ? 'remove' : keysCancel.has(combo) ? 'cancel' : null;
    if (!type || !isActive()) return;
    const tgt = e.target;
    const editable = tgt && (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName));
    if (editable && (e.key === 'Delete' || e.key === 'Backspace')) return; // edição de texto normal
    e.preventDefault(); e.stopImmediatePropagation();
    askPassword(type, infoFor(type, document.querySelector('tr.selected,tr.active,[class*=selected]'))).then((ok) => {
      if (!ok) return;
      bypass = true;
      try {
        (tgt || document.body).dispatchEvent(new KeyboardEvent('keydown', {
          key: e.key, code: e.code, keyCode: e.keyCode, which: e.which,
          ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, metaKey: e.metaKey,
          bubbles: true, cancelable: true, composed: true
        }));
      } finally { bypass = false; }
    });
  }, true);
})();
