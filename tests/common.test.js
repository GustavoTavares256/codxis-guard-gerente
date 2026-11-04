'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { loadCX } = require('./helpers');

describe('senhas (PBKDF2)', () => {
  test('aceita a senha correta e rejeita a errada', async () => {
    const { CX } = loadCX();
    const cred = await CX.makeCred('segredo123');
    assert.equal(await CX.verify('segredo123', cred), true);
    assert.equal(await CX.verify('errada', cred), false);
  });

  test('salt aleatório gera hashes diferentes para a mesma senha', async () => {
    const { CX } = loadCX();
    const a = await CX.makeCred('mesma'), b = await CX.makeCred('mesma');
    assert.notEqual(a.salt, b.salt);
    assert.notEqual(a.hash, b.hash);
  });

  test('não guarda a senha em texto puro', async () => {
    const { CX } = loadCX();
    const cred = await CX.makeCred('textopuro');
    assert.ok(!JSON.stringify(cred).includes('textopuro'));
  });

  test('verify sem credencial retorna false', async () => {
    const { CX } = loadCX();
    assert.equal(await CX.verify('x', undefined), false);
  });
});

describe('bloqueio por tentativas', () => {
  test('bloqueia após o máximo de falhas', async () => {
    const { CX } = loadCX();
    await CX.registerFail('m', 3, 60000);
    await CX.registerFail('m', 3, 60000);
    const l = await CX.registerFail('m', 3, 60000);
    assert.ok(l.until > Date.now());
    assert.equal(l.fails, 0);
  });

  test('clearFails zera o bloqueio', async () => {
    const { CX } = loadCX();
    for (let i = 0; i < 3; i++) await CX.registerFail('m', 3, 60000);
    await CX.clearFails('m');
    assert.deepEqual(await CX.getLock('m'), { fails: 0, until: 0 });
  });

  test('chaves diferentes não interferem entre si', async () => {
    const { CX } = loadCX();
    await CX.registerFail('admin', 1, 60000);
    assert.equal((await CX.getLock('manager')).until, 0);
  });
});

describe('log e configurações', () => {
  test('addLog registra com timestamp e limita a 5000 entradas', async () => {
    const { CX, store } = loadCX();
    store.authLog = Array.from({ length: 5000 }, (_, i) => ({ n: i }));
    await CX.addLog({ acao: 'x' });
    assert.equal(store.authLog.length, 5000);
    const last = store.authLog.at(-1);
    assert.equal(last.acao, 'x');
    assert.ok(!Number.isNaN(Date.parse(last.ts)));
  });

  test('getSettings mescla padrões com o salvo', async () => {
    const { CX } = loadCX();
    await CX.set('settings', { removeKeys: 'F2' });
    const s = await CX.getSettings();
    assert.equal(s.removeKeys, 'F2');
    assert.equal(s.cancelKeys, CX.DEFAULTS.cancelKeys);
  });
});

describe('helpers puros', () => {
  const { CX } = loadCX();

  test('norm remove acentos, caixa e espaços extras', () => {
    assert.equal(CX.norm('  Realizar   VENDA é ç '), 'realizar venda e c');
    assert.equal(CX.norm(null), '');
  });

  test('mkRx devolve null para vazio ou regex inválida', () => {
    assert.equal(CX.mkRx(''), null);
    assert.equal(CX.mkRx('('), null);
    assert.ok(CX.mkRx('abc').test('ABC'));
  });

  test('normCombo normaliza ordem de modificadores e caixa', () => {
    assert.equal(CX.normCombo('F7'), 'F7');
    assert.equal(CX.normCombo('shift + ctrl + a'), 'ctrl+shift+A');
  });

  test('comboOf lê um KeyboardEvent', () => {
    assert.equal(CX.comboOf({ key: 'F9' }), 'F9');
    assert.equal(CX.comboOf({ key: 'd', ctrlKey: true, altKey: true }), 'ctrl+alt+D');
  });

  test('regex padrão de remover/cancelar reconhecem os botões do PDV', () => {
    const rm = CX.mkRx(CX.DEFAULTS.removeRegex), ca = CX.mkRx(CX.DEFAULTS.cancelRegex);
    assert.ok(rm.test(CX.norm('Excluir item')));
    assert.ok(rm.test(CX.norm('fa-trash')));
    assert.ok(ca.test(CX.norm('Cancelar Venda')));
    assert.ok(ca.test(CX.norm('cancelar_cupom')));
    assert.ok(!ca.test(CX.norm('Finalizar venda')));
  });

  test('regex do campo de preço reconhece o Valor Unit. do PDV e ignora os demais', () => {
    const f = CX.mkRx(CX.DEFAULTS.priceFieldRegex);
    assert.ok(f.test(CX.norm('formNFCe:tableProdutosNovoLayout:precoUnitario')));
    assert.ok(f.test(CX.norm('Valor Unit.')));
    assert.ok(!f.test(CX.norm('formNFCe:tableProdutosNovoLayout:quantidade')));
    assert.ok(!f.test(CX.norm('descontoCurrency_input')));
    assert.ok(!f.test(CX.norm('formNFCe:tableProdutosNovoLayout:codigoProduto')));
  });

  test('regex de botões de alterar preço', () => {
    const p = CX.mkRx(CX.DEFAULTS.priceRegex);
    assert.ok(p.test(CX.norm('Alterar Preço')));
    assert.ok(p.test(CX.norm('editar_preco')));
    assert.ok(!p.test(CX.norm('Consultar preço')));
  });

  test('regex de tela reconhece "Realizar Venda"', () => {
    const rx = CX.mkRx(CX.DEFAULTS.screenRegex);
    assert.ok(rx.test(CX.norm('PDV › Realizar Venda')));
    // URL + título reais do PDV Codxis
    assert.ok(rx.test(CX.norm('https://web.codxis.api.br/sistema/pages/privado/nfce/emissao/pdv Emissão de NFCe')));
    assert.ok(!rx.test(CX.norm('https://web.codxis.api.br/sistema/pages/privado/index Codxis Web')));
  });
});
