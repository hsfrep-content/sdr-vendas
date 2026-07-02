const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { ConversationStore } = require('../src/state/conversationStore');

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sdr-store-')), 'state.json');
}

test('get retorna null para contato desconhecido', () => {
  const store = new ConversationStore(tmpFile());
  assert.equal(store.get('5511999990000@c.us'), null);
  assert.equal(store.has('5511999990000@c.us'), false);
});

test('set persiste e mescla o estado do contato', () => {
  const file = tmpFile();
  const store = new ConversationStore(file);
  store.set('5511999990000@c.us', { name: 'Maria', status: 'awaiting_reply' });
  store.set('5511999990000@c.us', { status: 'awaiting_human' });

  const state = store.get('5511999990000@c.us');
  assert.equal(state.name, 'Maria');
  assert.equal(state.status, 'awaiting_human');
  assert.ok(state.updatedAt);
});

test('estado sobrevive a uma nova instância apontando para o mesmo arquivo', () => {
  const file = tmpFile();
  new ConversationStore(file).set('5511999990000@c.us', { status: 'opted_out' });

  const reloaded = new ConversationStore(file);
  assert.equal(reloaded.get('5511999990000@c.us').status, 'opted_out');
});
