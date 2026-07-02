const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyIntent } = require('../src/nlp/interestClassifier');

test('detecta interesse claro em vender/alugar/comprar', () => {
  assert.equal(classifyIntent('Tenho interesse sim, quero vender meu apê').intent, 'interested');
  assert.equal(classifyIntent('quero alugar um imóvel').intent, 'interested');
  assert.equal(classifyIntent('Estou pensando em comprar uma casa').intent, 'interested');
  assert.equal(classifyIntent('Sim').intent, 'interested');
  assert.equal(classifyIntent('Claro, pode ser').intent, 'interested');
});

test('detecta falta de interesse sem confundir com negação de interesse', () => {
  assert.equal(classifyIntent('Não tenho interesse, obrigado').intent, 'not_interested');
  assert.equal(classifyIntent('No momento não, mas obrigado').intent, 'not_interested');
  assert.equal(classifyIntent('Não, obrigada').intent, 'not_interested');
});

test('detecta pedido de descadastro com prioridade sobre outras intenções', () => {
  assert.equal(classifyIntent('Para de mandar mensagem, por favor').intent, 'opt_out');
  assert.equal(classifyIntent('Pode parar de mandar mensagem, por favor').intent, 'opt_out');
  assert.equal(classifyIntent('quero sair da lista de vocês').intent, 'opt_out');
  assert.equal(classifyIntent('pode me tirar dessa lista?').intent, 'opt_out');
});

test('classifica como unclear quando a resposta é ambígua ou vazia', () => {
  assert.equal(classifyIntent('oi, tudo bem?').intent, 'unclear');
  assert.equal(classifyIntent('').intent, 'unclear');
  assert.equal(classifyIntent(undefined).intent, 'unclear');
});

test('ignora acentuação e caixa ao classificar', () => {
  assert.equal(classifyIntent('QUERO VENDER MEU IMÓVEL').intent, 'interested');
  assert.equal(classifyIntent('nÃo tenho interesse').intent, 'not_interested');
});
