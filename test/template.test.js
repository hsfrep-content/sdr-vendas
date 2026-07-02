const test = require('node:test');
const assert = require('node:assert/strict');
const { firstName, buildInitialMessage } = require('../src/messaging/template');

test('firstName extrai e capitaliza apenas o primeiro nome', () => {
  assert.equal(firstName('maria da silva'), 'Maria');
  assert.equal(firstName('JOÃO PEREIRA'), 'João');
  assert.equal(firstName('  ana  '), 'Ana');
  assert.equal(firstName(''), '');
});

test('buildInitialMessage inclui o nome do cliente, a pergunta e a assinatura em negrito', () => {
  const message = buildInitialMessage('Maria Silva', { companyName: 'Imob X', agentName: 'Bruno', agentRole: 'corretor' });
  assert.match(message, /Maria/);
  assert.match(message, /vender/);
  assert.match(message, /alugar/);
  assert.match(message, /adquirir/);
  assert.match(message, /Imob X/);
  assert.match(message, /\*Bruno\*, corretor da Imob X/);
});

test('buildInitialMessage não pressiona nem soa comercial demais', () => {
  const message = buildInitialMessage('Carlos', { companyName: 'Imob X', agentName: 'Bruno', agentRole: 'corretor' });
  assert.doesNotMatch(message, /urgente|última chance|promoção/i);
});

test('buildInitialMessage lida com nome vazio sem quebrar a saudação', () => {
  const message = buildInitialMessage('', { companyName: 'Imob X', agentName: 'Bruno', agentRole: 'corretor' });
  assert.match(message, /^Oi! Tudo bem\? 😊/);
});

test('buildInitialMessage usa os valores padrão (Linhares / A&L Negócios Imobiliários) quando não informado', () => {
  const message = buildInitialMessage('Ana');
  assert.match(message, /\*Linhares\*/);
  assert.match(message, /A&L Negócios Imobiliários/);
  assert.match(message, /corretor de imóveis e gestor de negócios/);
});
