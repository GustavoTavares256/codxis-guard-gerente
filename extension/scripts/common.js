/* Utilitários compartilhados (content script + página de opções) */
const CX = (() => {
  const enc = new TextEncoder();
  const toHex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
  const ITER = 150000;

  const DEFAULTS = {
    company: 'F. H. Comercio De Frios Ltda',
    // Regex aplicadas sobre texto normalizado (minúsculo, sem acento).
    screenRegex: 'realizar venda|nfce/emissao/pdv',
    removeRegex: 'excluir|cancelar[\\s_-]*item|remov|lixeira|trash|apagar',
    cancelRegex: 'cancelar[\\s_-]*venda|cancel\\w*[\\s_-]*(o[\\s_-]*)?(cupom|pedido)',
    // Alteração de preço: botões "alterar preço" e o campo Valor Unit. (testado contra id/name/aria-label)
    priceRegex: 'alterar[\\s_-]*(o[\\s_-]*)?preco|editar[\\s_-]*preco|mudar[\\s_-]*preco',
    priceFieldRegex: 'precounitario|preco[\\s_-]*unit|valor[\\s_-]*unit|vlr[\\s_-]*unit',
    // Modal do Codxis "Desconto maior que o limite do vendedor": Confirmar exige também a senha do gerente
    discountDialogRegex: 'autorizacaodescontodialog|limite do vendedor',
    // Atalhos do PDV Codxis: F7 = Cancelar Item, F9 = Cancelar Venda
    removeKeys: 'F7',
    cancelKeys: 'F9',
    // Modo em abas do PDV (opcional): F4 liga/desliga, Shift+F4 alterna Produtos/Pagamento
    tabsKey: 'F4',
    tabsSwitchKey: 'Shift+F4',
    boldProductName: true, // nome do produto em negrito na lista de itens do PDV
    restoreCart: true, // oferece reinserir os itens da venda após recarregar a página
    debug: false
  };

  async function get(k) {
    const r = await chrome.storage.local.get(k);
    return r[k];
  }
  const set = (k, v) => chrome.storage.local.set({ [k]: v });

  async function hash(pwd, salt) {
    const key = await crypto.subtle.importKey('raw', enc.encode(pwd), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: ITER }, key, 256);
    return toHex(bits);
  }
  async function makeCred(pwd) {
    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
    return { salt, hash: await hash(pwd, salt), algo: 'PBKDF2-SHA256', iter: ITER };
  }
  async function verify(pwd, cred) {
    if (!cred) return false;
    return (await hash(pwd, cred.salt)) === cred.hash;
  }

  // Bloqueio por tentativas erradas (persistente)
  async function getLock(k) { return (await get('lock_' + k)) || { fails: 0, until: 0 }; }
  async function registerFail(k, max = 3, ms = 60000) {
    const l = await getLock(k);
    l.fails++;
    if (l.fails >= max) { l.until = Date.now() + ms; l.fails = 0; }
    await set('lock_' + k, l);
    return l;
  }
  const clearFails = (k) => set('lock_' + k, { fails: 0, until: 0 });

  async function addLog(entry) {
    const log = (await get('authLog')) || [];
    log.push({ ts: new Date().toISOString(), ...entry });
    if (log.length > 5000) log.splice(0, log.length - 5000);
    await set('authLog', log);
  }

  async function getSettings() {
    return { ...DEFAULTS, ...((await get('settings')) || {}) };
  }

  /* ---------- Helpers puros (testáveis) ---------- */
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const mkRx = (src) => { try { return src ? new RegExp(src, 'i') : null; } catch (e) { return null; } };
  const MODS = ['ctrl', 'alt', 'shift', 'meta'];
  const fmtKey = (k) => (k.length === 1 ? k.toUpperCase() : k);
  const normCombo = (s) => {
    const parts = s.split('+').map((p) => p.trim()).filter(Boolean);
    const mods = MODS.filter((m) => parts.some((p) => p.toLowerCase() === m));
    const key = parts.find((p) => !MODS.includes(p.toLowerCase())) || '';
    return [...mods, fmtKey(key)].join('+');
  };
  const comboOf = (e) => {
    const mods = [e.ctrlKey && 'ctrl', e.altKey && 'alt', e.shiftKey && 'shift', e.metaKey && 'meta'].filter(Boolean);
    return [...mods, fmtKey(e.key)].join('+');
  };

  /* ---------- Visual dos modais (copia o estilo do modal "Autorização" do Codxis) ---------- */
  const FONT = '"Neue Haas Grotesk Display Pro","Segoe UI",Roboto,Arial,sans-serif';
  const THEMES = {
    light: { card: '#ffffff', text: '#333333', label: '#282e3f', inputBg: '#ffffff', inputBorder: '#040823', inputText: '#282e3f',
      ok: '#040823', okText: '#ffffff', alt: '#282e3f', altText: '#ffffff', icoBg: '#d7d8db', icoFill: '#040823',
      veil: 'rgba(195,208,216,.9)', info: '#eceef2', err: '#c62828' },
    dark: { card: '#1b1c20', text: '#ffffff', label: '#d8dae3', inputBg: '#1b1c20', inputBorder: '#e4e6f0', inputText: '#ffffff',
      ok: '#dcdcf7', okText: '#040823', alt: '#b9bcc8', altText: '#040823', icoBg: '#3a3c44', icoFill: '#ffffff',
      veil: 'rgba(46,58,66,.9)', info: '#2a2c33', err: '#ff8a80' }
  };
  // Luminância de uma cor CSS "rgb(r, g, b)" / "rgba(r, g, b, a)"; null se transparente/ilegível.
  function luminance(css) {
    const n = (String(css).match(/[\d.]+/g) || []).map(Number);
    if (n.length < 3 || (n.length > 3 && n[3] === 0)) return null;
    return 0.299 * n[0] + 0.587 * n[1] + 0.114 * n[2];
  }
  function isDark(doc) {
    try {
      for (const el of [doc.body, doc.documentElement]) {
        const l = luminance(getComputedStyle(el).backgroundColor);
        if (l !== null) return l < 128;
      }
    } catch (e) { /* ignore */ }
    return false;
  }
  const ICON = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M3 7a3 3 0 0 1 3-3h12v3h2a1 1 0 0 1 1 1v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7zm3-1a1 1 0 0 0 0 2h9V6H6zm11 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/></svg>';
  function modalCss(dark) {
    const t = THEMES[dark ? 'dark' : 'light'];
    return `*{box-sizing:border-box;font-family:${FONT}}
      .bg{position:fixed;inset:0;background:${t.veil};display:flex;align-items:center;justify-content:center}
      .box{background:${t.card};color:${t.text};width:440px;max-width:92vw;border-radius:20px;padding:24px 40px 28px}
      .head{display:flex;gap:14px;align-items:center;margin-bottom:18px}
      .ico{width:48px;height:48px;border-radius:5px;background:${t.icoBg};color:${t.icoFill};display:flex;align-items:center;justify-content:center;flex:none}
      h2{margin:0;font-size:28px;font-weight:700;line-height:1.15}
      .sub{margin:2px 0 0;font-size:14px;font-weight:500}
      p{margin:0 0 10px;font-size:14px;font-weight:500}
      .info{background:${t.info};border-radius:5px;padding:8px 10px;font-size:14px;margin-bottom:14px;word-break:break-word}
      .info:empty{display:none}
      label{display:block;font-size:14px;color:${t.label};margin:0 0 6px}
      input{width:100%;height:32px;padding:9px 11px 9px 12px;font-size:14px;font-weight:500;color:${t.inputText};background:${t.inputBg};border:.8px solid ${t.inputBorder};border-radius:5px;outline:none}
      input:focus{box-shadow:0 0 0 2px ${t.inputBorder}33}
      input:disabled{opacity:.6}
      .err{min-height:18px;margin:8px 0 0;font-size:13px;color:${t.err}}
      ul{margin:0 0 12px;padding:8px 10px 8px 26px;background:${t.info};border-radius:5px;font-size:13px;max-height:180px;overflow:auto}
      .row{display:flex;gap:10px;margin-top:14px}
      button{flex:1;height:36px;padding:0 14px;border:0;border-radius:5px;font-size:14px;cursor:pointer;background:${t.alt};color:${t.altText}}
      button.ok{background:${t.ok};color:${t.okText}}
      button:disabled{opacity:.5;cursor:not-allowed}`;
  }
  const ui = { THEMES, FONT, ICON, luminance, isDark, modalCss };

  return { DEFAULTS, ui, norm, mkRx, normCombo, comboOf, hash, get, set, makeCred, verify, getLock, registerFail, clearFails, addLog, getSettings };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CX;
