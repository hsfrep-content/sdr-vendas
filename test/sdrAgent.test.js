const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { SdrAgent } = require('../src/sdrAgent');
const { ConversationStore } = require('../src/state/conversationStore');

const CONTACTS_FILE = path.join(__dirname, 'fixtures', 'sdrAgentContacts.csv');

class FakeWhatsAppClient {
  constructor() {
    this.sent = [];
    this.handlers = [];
  }

  onMessage(handler) {
    this.handlers.push(handler);
  }

  async sendMessage(to, text) {
    this.sent.push({ to, text });
  }

  async emitIncoming(payload) {
    for (const handler of this.handlers) await handler(payload);
  }
}

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdr-agent-'));
  const config = {
    contactsFile: CONTACTS_FILE,
    defaultCountryCode: '55',
    companyName: 'Imob X',
    agentName: '',
    minDelayMs: 0,
    maxDelayMs: 1,
    handoffQueueFile: path.join(dir, 'handoff-queue.json'),
  };
  const store = new ConversationStore(path.join(dir, 'state.json'));
  const whatsappClient = new FakeWhatsAppClient();
  const agent = new SdrAgent({ whatsappClient, store, config });
  return { agent, store, whatsappClient, config };
}

test('runCampaign envia mensagem inicial só para contatos autorizados', async () => {
  const { agent, whatsappClient } = setup();
  await agent.runCampaign();

  const recipients = whatsappClient.sent.map((m) => m.to);
  assert.deepEqual(recipients.sort(), ['5511966665555@c.us', '5511999990000@c.us'].sort());
  assert.ok(!recipients.includes('5511977776666@c.us'), 'contato sem consentimento não deve ser contatado');
});

test('runCampaign não reenvia mensagem inicial a quem já foi contatado', async () => {
  const { agent, whatsappClient, store } = setup();
  store.set('5511999990000@c.us', { name: 'Maria Silva', status: 'awaiting_reply' });

  await agent.runCampaign();

  const recipients = whatsappClient.sent.map((m) => m.to);
  assert.deepEqual(recipients, ['5511966665555@c.us']);
});

test('resposta com interesse interrompe o fluxo automático e aciona atendimento humano', async () => {
  const { agent, whatsappClient, store, config } = setup();
  const whatsappId = '5511999990000@c.us';
  store.set(whatsappId, { name: 'Maria Silva', status: 'awaiting_reply' });

  const result = await agent.handleIncomingMessage({
    from: whatsappId,
    name: 'Maria Silva',
    body: 'Tenho interesse sim, quero vender meu apê',
  });

  assert.equal(result.action, 'handoff');
  assert.equal(store.get(whatsappId).status, 'awaiting_human');

  const queue = JSON.parse(fs.readFileSync(config.handoffQueueFile, 'utf8'));
  assert.equal(queue.length, 1);
  assert.equal(queue[0].reason, 'interesse_detectado');
  assert.equal(queue[0].whatsappId, whatsappId);

  // Depois do handoff, novas mensagens do mesmo contato não disparam mais respostas automáticas.
  whatsappClient.sent = [];
  const second = await agent.handleIncomingMessage({ from: whatsappId, name: 'Maria Silva', body: 'oi de novo' });
  assert.equal(second, null);
  assert.equal(whatsappClient.sent.length, 0);
});

test('pedido de descadastro encerra o contato e é respeitado em campanhas futuras', async () => {
  const { agent, whatsappClient, store } = setup();
  const whatsappId = '5511999990000@c.us';
  store.set(whatsappId, { name: 'Maria Silva', status: 'awaiting_reply' });

  const result = await agent.handleIncomingMessage({
    from: whatsappId,
    name: 'Maria Silva',
    body: 'Pode parar de mandar mensagem, por favor',
  });

  assert.equal(result.action, 'opt_out');
  assert.equal(store.get(whatsappId).status, 'opted_out');

  whatsappClient.sent = [];
  await agent.runCampaign();
  const recipients = whatsappClient.sent.map((m) => m.to);
  assert.ok(!recipients.includes(whatsappId), 'contato que se descadastrou não pode ser recontatado');
});

test('resposta ambígua gera uma pergunta de esclarecimento antes de acionar um humano', async () => {
  const { agent, whatsappClient, store } = setup();
  const whatsappId = '5511999990000@c.us';
  store.set(whatsappId, { name: 'Maria Silva', status: 'awaiting_reply' });

  const first = await agent.handleIncomingMessage({ from: whatsappId, name: 'Maria Silva', body: 'oi' });
  assert.equal(first.action, 'clarify');
  assert.equal(store.get(whatsappId).status, 'awaiting_reply');
  assert.equal(store.get(whatsappId).clarificationAttempts, 1);

  const second = await agent.handleIncomingMessage({ from: whatsappId, name: 'Maria Silva', body: 'sei lá' });
  assert.equal(second.action, 'handoff');
  assert.equal(store.get(whatsappId).status, 'awaiting_human');
});

test('mensagem de contato que a campanha nunca iniciou é ignorada', async () => {
  const { agent, whatsappClient } = setup();
  const result = await agent.handleIncomingMessage({
    from: '5511900000000@c.us',
    name: 'Desconhecido',
    body: 'Tenho interesse em comprar',
  });
  assert.equal(result, null);
  assert.equal(whatsappClient.sent.length, 0);
});
