/* Codxis Guard - content script */
(() => {
  'use strict';
  const TAG = '[CX-Guard]';
  let cfg = { ...CX.DEFAULTS };
  let rxRemove = null, rxCancel = null, rxScreen = null, rxPrice = null, rxPriceField = null, rxDiscount = null;
  const priceOk = new WeakSet(); // campos de preço já autorizados (até perder o foco)
  let keysRemove = new Set(), keysCancel = new Set(), keysTabs = new Set(), keysTabsSwitch = new Set();
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
    keysTabs = toSet(cfg.tabsKey || ''); keysTabsSwitch = toSet(cfg.tabsSwitchKey || '');
    lastCheck = 0;
  }
  CX.get('settings').then(applyCfg);
  chrome.storage.onChanged.addListener((ch) => { if (ch.settings) applyCfg(ch.settings.newValue); });

  /* ---------- Detecção de tela / empresa ---------- */
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  let companyState; // undefined = nunca visto | '' = lista do parceiro | nome normalizado da empresa
  CX.get('companySeen').then((v) => { if (companyState === undefined) companyState = v; });
  chrome.storage.onChanged.addListener((ch) => { if (ch.companySeen) companyState = ch.companySeen.newValue; });
  function setCompany(v) { if (companyState !== v) { companyState = v; CX.set('companySeen', v); } }
  function checkActive() {
    lastCheck = Date.now();
    if (!document.body) { active = false; return; }
    const company = norm(cfg.company);
    // O nome da empresa aparece no painel, mas não na tela do PDV. Lembramos (compartilhado entre
    // abas) qual empresa foi vista por último. A lista do parceiro (todas as empresas) zera a marca.
    // Sem marca nenhuma (undefined) a extensão fica ATIVA: na dúvida, protege.
    let companyOk = !company;
    if (!companyOk) {
      if (/indexParceiroPrincipal/i.test(location.href)) setCompany('');
      else if (norm(document.body.textContent).includes(company)) setCompany(company);
      companyOk = companyState === undefined || companyState === company;
    }
    const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,.breadcrumb,[class*=title],[class*=titulo]')]
      .filter(visible).map((e) => (e.textContent || '').slice(0, 200)).join(' ');
    const screenText = norm(location.href + ' ' + document.title + ' ' + heads);
    const screenOk = !rxScreen || rxScreen.test(screenText);
    active = companyOk && screenOk;
    try { document.documentElement.setAttribute('data-cx-active', JSON.stringify({ active, companyOk, screenOk, empresa: companyState })); } catch (e) { /* ignore */ }
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
        <style>${CX.ui.modalCss(CX.ui.isDark(document))}</style>
        <div class="bg"><div class="box" role="dialog" aria-modal="true">
          <div class="head"><div class="ico">${CX.ui.ICON}</div><div><h2>Autorização</h2><p class="sub"></p></div></div>
          <div class="info"></div>
          <label>Senha do gerente</label>
          <input type="password" autocomplete="new-password" />
          <p class="err"></p>
          <div class="row"><button class="ok">Confirmar</button><button class="cancel">Fechar</button></div>
        </div></div>`;
      const $ = (s) => root.querySelector(s);
      $('.sub').textContent = LABEL[type] + ' — senha do gerente necessária.';
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
      if (hit.type === 'cancel') clearCart();
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

  /* ---------- Restaurar itens da venda após recarregar a página ---------- */
  // O PDV guarda a venda no servidor e a zera ao recarregar. Guardamos código+quantidade dos itens
  // (por aba) e, após o reload, oferecemos reinseri-los. Preço/desconto/pagamento NÃO são restaurados.
  const CART_KEY = 'cx_cart', CART_TTL = 60 * 60 * 1000;
  let restoring = false, sawItems = false, cartTimer = null;
  const isPdv = () => !!rxScreen && rxScreen.test(norm(location.href));
  const codeInput = () => document.querySelector('input[id$="tableProdutosNovoLayout:codigoProduto"]');
  const qtyInput = () => document.querySelector('input[id$="tableProdutosNovoLayout:quantidade"]');
  const itemCells = () => [...document.querySelectorAll('[id$="descricaoProdTable"]')];

  function readCart() {
    return itemCells().map((cell) => {
      // O span só tem o nome; "N - Cod: 101 -" fica na célula (td) que o contém.
      const td = cell.closest('td') || cell;
      const text = (td.innerText || '').replace(/\s+/g, ' ').trim();
      const m = text.match(/Cod:\s*(\S+)/i);
      const tr = cell.closest('tr');
      const qty = tr && tr.children[1] ? tr.children[1].innerText.trim() : '';
      return m ? { cod: m[1], qty: qty || '1,0000', nome: text.slice(0, 80) } : null;
    }).filter(Boolean);
  }
  const loadCart = () => {
    try {
      const o = JSON.parse(sessionStorage.getItem(CART_KEY) || 'null');
      return o && Date.now() - o.ts < CART_TTL && o.items.length ? o : null;
    } catch (e) { return null; }
  };
  const saveCart = (items) => { try { sessionStorage.setItem(CART_KEY, JSON.stringify({ ts: Date.now(), items })); } catch (e) { /* ignore */ } };
  const clearCart = () => { try { sessionStorage.removeItem(CART_KEY); } catch (e) { /* ignore */ } sawItems = false; };

  const dbg = (...a) => { if (cfg.debug) console.log(TAG, 'carrinho', ...a); };
  const mark = (o) => { try { document.documentElement.setAttribute('data-cx-guard', JSON.stringify({ v: chrome.runtime.getManifest().version, ...o })); } catch (e) { /* ignore */ } };
  function syncCart() {
    const st = { restoring, on: cfg.restoreCart, pdv: isPdv(), campo: !!codeInput(), itens: itemCells().length };
    dbg('sync', st); mark({ fase: 'sync', ...st });
    if (restoring || !cfg.restoreCart || !isPdv() || !codeInput()) return;
    const items = readCart();
    if (items.length) { sawItems = true; saveCart(items); }
    else if (sawItems) clearCart(); // esvaziou na própria página (cancelou/finalizou)
  }
  const scheduleSync = () => { clearTimeout(cartTimer); cartTimer = setTimeout(syncCart, 700); };

  const setVal = (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const fire = (el, v) => { el.focus(); setVal(el, v); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const insertBtn = () => [...document.querySelectorAll('button')].find((x) => /^\s*inserir\s*$/i.test(x.innerText) && x.id.includes('tableProdutosNovoLayout'));

  // Ordem validada no PDV: código (resolve o produto) -> quantidade -> botão Inserir.
  // Mudar a quantidade ANTES do código altera o item anterior da venda.
  async function insertItem(it) {
    const q = qtyInput(), c = codeInput(), btn = insertBtn();
    if (!q || !c || !btn) return false;
    const before = itemCells().length;
    fire(c, it.cod); await sleep(1500);
    fire(q, it.qty); await sleep(1200);
    btn.click();
    for (let i = 0; i < 80; i++) { await sleep(100); if (itemCells().length > before) return true; }
    return false;
  }

  function overlay(html) {
    const host = document.createElement('div');
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>${CX.ui.modalCss(CX.ui.isDark(document))}</style><div class="bg"><div class="box">${html}</div></div>`;
    (document.body || document.documentElement).appendChild(host);
    return { host, root };
  }

  function askRestore(cart) {
    return new Promise((resolve) => {
      const { host, root } = overlay(`<div class="head"><div class="ico">${CX.ui.ICON}</div><div><h2>Restaurar venda?</h2><p class="sub">A página recarregou e a venda foi zerada.</p></div></div>
        <p>Reinserir os itens abaixo? Preços, descontos e pagamentos não são restaurados.</p>
        <ul></ul><div class="row"><button class="ok">Restaurar</button><button class="no">Descartar</button></div>`);
      const ul = root.querySelector('ul');
      cart.items.forEach((i) => { const li = document.createElement('li'); li.textContent = i.nome + '  — qtd ' + i.qty; ul.appendChild(li); });
      currentHost = host;
      const done = (v) => { host.remove(); currentHost = null; resolve(v); };
      root.querySelector('.ok').addEventListener('click', () => done(true));
      root.querySelector('.no').addEventListener('click', () => done(false));
      host.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); done(true); } else if (e.key === 'Escape') { e.preventDefault(); done(false); }
      });
      root.querySelector('.ok').focus();
    });
  }

  async function restoreCart(cart) {
    restoring = true;
    const { host, root } = overlay(`<div class="head"><div class="ico">${CX.ui.ICON}</div><div><h2>Restaurando…</h2><p class="sub st"></p></div></div>`);
    currentHost = host;
    let ok = 0;
    try {
      for (let i = 0; i < cart.items.length; i++) {
        root.querySelector('.st').textContent = 'Item ' + (i + 1) + ' de ' + cart.items.length + ': ' + cart.items[i].nome;
        if (await insertItem(cart.items[i])) ok++;
      }
      const q = qtyInput(), c = codeInput();
      if (q) { setVal(q, '1,0000'); q.dispatchEvent(new Event('change', { bubbles: true })); }
      if (c) setVal(c, '');
      root.querySelector('h2').textContent = ok + ' de ' + cart.items.length + ' itens restaurados';
      root.querySelector('.st').textContent = ok < cart.items.length ? 'Alguns itens não foram inseridos: confira a venda.' : '';
      await sleep(ok < cart.items.length ? 3500 : 1200);
    } finally { host.remove(); currentHost = null; restoring = false; syncCart(); }
  }

  async function initCart() {
    for (let i = 0; i < 60 && !(codeInput() && document.querySelector('[id*="tableProdutosNovoLayout"]')); i++) await sleep(250);
    const st = { on: cfg.restoreCart, pdv: isPdv(), campo: !!codeInput(), salvo: !!loadCart() };
    dbg('init', st); mark({ fase: 'init', ...st });
    if (!cfg.restoreCart || !isPdv() || !codeInput()) return;
    const cart = loadCart();
    if (cart && !itemCells().length) {
      if (await askRestore(cart)) await restoreCart(cart); else clearCart();
    } else syncCart();
    new MutationObserver(scheduleSync).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }
  const bootCart = () => { mark({ fase: 'boot' }); CX.get('settings').then(() => initCart()); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootCart); else bootCart();

  /* ---------- Modo em abas (F4): Produtos | Pagamento ---------- */
  // Opcional: F4 liga/desliga. O PDV é uma só página (uma só venda); as abas apenas mostram um cartão
  // por vez em tela cheia. Shift+F4 alterna entre as abas. Fora do modo, nada muda.
  const TABS_KEY = 'cx_tabs';
  let tabsMode = ''; // '' (desligado) | 'produtos' | 'pagamento'
  const pdvCards = () => [...document.querySelectorAll('.v2-principal > .cardv2')];

  function tabsTotal() {
    const left = pdvCards()[0];
    if (!left) return '';
    // o total é um <div> com 2 filhos ("R$" + valor): usa o último elemento cujo texto é só um valor em reais
    const money = /^R\$\s*[\d.]+,\d{2}$/;
    const leaves = [...left.querySelectorAll('*')].filter((e) => e.children.length <= 2 && money.test((e.textContent || '').replace(/\s+/g, ' ').trim()));
    return leaves.length ? leaves[leaves.length - 1].textContent.replace(/\s+/g, ' ').trim() : '';
  }
  function tabsCss(dark) {
    const t = CX.ui.THEMES[dark ? 'dark' : 'light'];
    return `html[data-cx-tabs] .v2-principal{padding-top:54px!important;box-sizing:border-box!important;height:100vh!important}
      html[data-cx-tabs] .v2-principal>.cardv2{width:100%!important;max-width:100%!important;flex:1 1 100%!important}
      html[data-cx-tabs="produtos"] .v2-principal>.cardv2:nth-of-type(1){height:calc(100vh - 54px - 112px)!important;min-height:0!important}
      html[data-cx-tabs="produtos"] .v2-principal>.cardv2:nth-of-type(2){position:fixed!important;left:0;right:0;bottom:0;height:auto!important;min-height:0!important;z-index:900;padding:6px 12px!important;border-radius:0!important;background:${t.card}!important}
      html[data-cx-tabs="produtos"] .v2-principal>.cardv2:nth-of-type(2) .v2-direito>*:not(.cx-btns){display:none!important}
      html[data-cx-tabs="pagamento"] .v2-principal>.cardv2:nth-of-type(1){display:none!important}
      #cx-tabbar{position:fixed;top:0;left:0;right:0;height:46px;z-index:950;display:flex;align-items:center;gap:8px;padding:0 14px;background:${t.card};color:${t.text};font-family:${CX.ui.FONT};box-shadow:0 1px 0 ${t.inputBorder}33}
      #cx-tabbar button{height:32px;padding:0 18px;border:0;border-radius:5px;font:500 14px ${CX.ui.FONT};cursor:pointer;background:${t.alt};color:${t.altText};opacity:.75}
      #cx-tabbar button.on{background:${t.ok};color:${t.okText};opacity:1}
      #cx-tabbar .tot{margin-left:auto;font-size:14px;font-weight:500}
      #cx-tabbar .tot b{font-size:20px;font-weight:700;margin-left:6px}
      #cx-tabbar .hint{font-size:12px;opacity:.7;margin-left:14px}`;
  }
  function renderTabs() {
    let style = document.getElementById('cx-tabs-style'), bar = document.getElementById('cx-tabbar');
    if (!tabsMode) { if (style) style.remove(); if (bar) bar.remove(); return; }
    if (!style) { style = document.createElement('style'); style.id = 'cx-tabs-style'; document.head.appendChild(style); }
    style.textContent = tabsCss(CX.ui.isDark(document));
    if (!bar) {
      bar = document.createElement('div'); bar.id = 'cx-tabbar';
      bar.innerHTML = '<button type="button" data-t="produtos">Produtos</button><button type="button" data-t="pagamento">Pagamento</button>' +
        '<span class="tot">Total<b></b></span><span class="hint">F4 sai · Shift+F4 alterna</span>';
      bar.addEventListener('click', (e) => { const b = e.target.closest('button[data-t]'); if (b) { e.preventDefault(); e.stopPropagation(); applyTabs(b.dataset.t); } });
      document.body.appendChild(bar);
    }
    bar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === tabsMode));
    bar.querySelector('.tot b').textContent = tabsTotal();
  }
  function applyTabs(mode) {
    tabsMode = mode;
    try { sessionStorage.setItem(TABS_KEY, mode); } catch (e) { /* ignore */ }
    if (mode) {
      document.documentElement.setAttribute('data-cx-tabs', mode);
      // marca a barra de botões (F1, F7, F9...) para continuar visível na aba Produtos
      document.querySelectorAll('button').forEach((b) => {
        if (/Cancelar\s*Venda/i.test(b.innerText || '')) { const w = b.closest('.d-flex.flex-wrap'); if (w) w.classList.add('cx-btns'); }
      });
    } else document.documentElement.removeAttribute('data-cx-tabs');
    renderTabs();
    window.dispatchEvent(new Event('resize'));
  }
  setInterval(() => { const b = tabsMode && document.querySelector('#cx-tabbar .tot b'); if (b) b.textContent = tabsTotal(); }, 1000); // total da barra

  window.addEventListener('keydown', (e) => {
    if (!e.isTrusted || e.altKey || e.ctrlKey || e.metaKey || currentHost || !e.key || !isPdv() || !codeInput()) return;
    const k = comboOf(e);
    if (keysTabs.has(k)) { e.preventDefault(); e.stopImmediatePropagation(); applyTabs(tabsMode ? '' : 'produtos'); }
    else if (tabsMode && keysTabsSwitch.has(k)) { e.preventDefault(); e.stopImmediatePropagation(); applyTabs(tabsMode === 'produtos' ? 'pagamento' : 'produtos'); }
  }, true);

  (async () => { // se a página recarregar com o modo ligado, mantém
    for (let i = 0; i < 60 && pdvCards().length < 2; i++) await sleep(250);
    let saved = '';
    try { saved = sessionStorage.getItem(TABS_KEY) || ''; } catch (e) { /* ignore */ }
    if (saved && isPdv() && pdvCards().length === 2) applyTabs(saved);
  })();
})();
