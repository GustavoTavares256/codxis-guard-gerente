/* Utilitários compartilhados (content script + página de opções) */
const CX = (() => {
  const enc = new TextEncoder();
  const toHex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
  const ITER = 150000;

  const DEFAULTS = {
    company: 'F. H. Comercio De Frios Ltda',
    // Regex aplicadas sobre texto normalizado (minúsculo, sem acento).
    screenRegex: 'realizar venda',
    removeRegex: 'excluir|cancelar[\\s_-]*item|remov|lixeira|trash|apagar',
    cancelRegex: 'cancelar[\\s_-]*venda|cancel\\w*[\\s_-]*(o[\\s_-]*)?(cupom|pedido)',
    // Atalhos do PDV Codxis: F7 = Cancelar Item, F9 = Cancelar Venda
    removeKeys: 'F7',
    cancelKeys: 'F9',
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

  return { DEFAULTS, norm, mkRx, normCombo, comboOf, hash, get, set, makeCred, verify, getLock, registerFail, clearFails, addLog, getSettings };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CX;
