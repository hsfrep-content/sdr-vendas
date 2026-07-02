const test = require('node:test');
const assert = require('node:assert/strict');
const { firstName, buildInitialMessage } = require('../src/messaging/template');

test('firstName extrai e capitaliza apenas o primeiro nome', () => {
  assert.equal(firstName('maria da silva'), 'Maria');
  assert.equal(firstName('JOÃO PEREIRA'), 'João');
  assert.equal(firstName('  ana  '), 'Ana');
  assert.equal(firstName(''), '');
});

test('buildInitialMessage inclui o nome do cliente e é amistosa', () => {
  const message = buildInitialMessage('Maria Silva', { companyName: 'Imob X' });
  assert.match(message, /Maria/);
  assert.match(message, /vender/);
  assert.match(message, /alugar/);
  assert.match(message, /comprar/);
  assert.match(message, /Imob X/);
});

test('buildInitialMessage não pressiona nem soa comercial demais', () => {
  const message = buildInitialMessage('Carlos', { companyName: 'Imob X' });
  assert.match(message, /sem compromisso/i);
  assert.doesNotMatch(message, /urgente|última chance|promoção/i);
});

test('buildInitialMessage lida com nome vazio sem quebrar a saudação', () => {
  const message = buildInitialMessage('', { companyName: 'Imob X' });
  assert.match(message, /^Oi! Tudo bem\?/);
});

test('buildInitialMessage inclui assinatura do consultor quando informado', () => {
  const message = buildInitialMessage('Ana', { companyName: 'Imob X', agentName: 'Bruno' });
  assert.match(message, /Bruno, da Imob X/);
});
