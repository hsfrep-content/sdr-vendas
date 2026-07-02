const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadContacts, loadAuthorizedContacts } = require('../src/contacts/loadContacts');

const FIXTURE = path.join(__dirname, 'fixtures', 'contacts.csv');

test('loadContacts normaliza telefone e ignora linhas sem nome ou telefone', () => {
  const contacts = loadContacts(FIXTURE);
  const names = contacts.map((c) => c.name);
  assert.deepEqual(names, ['Maria Silva', 'João Pereira', 'Ana Souza', 'Pedro Rocha']);
  assert.equal(contacts[0].whatsappId, '5511999990000@c.us');
  assert.equal(contacts[3].whatsappId, '5511966665555@c.us');
});

test('loadContacts interpreta variações de consentimento (sim/SIM/true)', () => {
  const contacts = loadContacts(FIXTURE);
  assert.equal(contacts.find((c) => c.name === 'Maria Silva').consent, true);
  assert.equal(contacts.find((c) => c.name === 'João Pereira').consent, true);
  assert.equal(contacts.find((c) => c.name === 'Pedro Rocha').consent, true);
  assert.equal(contacts.find((c) => c.name === 'Ana Souza').consent, false);
});

test('loadAuthorizedContacts só retorna quem deu consentimento explícito', () => {
  const authorized = loadAuthorizedContacts(FIXTURE);
  const names = authorized.map((c) => c.name);
  assert.deepEqual(names, ['Maria Silva', 'João Pereira', 'Pedro Rocha']);
  assert.ok(!names.includes('Ana Souza'));
});
