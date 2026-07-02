const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { SdrAgent } = require('../src/sdrAgent');
const { ConversationStore } = require('../src/state/conversationStore');
const { SELECTION_OPTIONS } = require('../src/messaging/selectionMenu');

const CONTACTS_FILE = path.join(__dirname, 'fixtures', 'sdrAgentContacts.csv');

class FakeWhatsAppClient {
  constructor() {
    this.sent = [];
    this.menusSent = [];
    this.handlers = [];
  }

  onMessage(handler) {
    this.handlers.push(handler);
  }

  async sendMessage(to, text) {
    this.sent.push({ to, text });
  }

  async sendSelectionMenu(to, menu) {
    this.menusSent.push({ to, menu });
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
    agentName: 'Bruno',
    agentRole: 'corretor',
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

test('primeira resposta do cliente abre a caixa de seleção, sem classificar o texto livre', async () => {
  const { agent, whatsappClient, store } = setup();
  const whatsappId = '5511999990000@c.us';
  store.set(whatsappId, { name: 'Maria Silva', status: 'awaiting_reply' });

  const result = await agent.handleIncomingMessage({ from: whatsappId, name: 'Maria Silva', body: 'Oi, tudo bem?' });

  assert.equal(result.action, 'menu_sent');
  assert.equal(store.get(whatsappId).status, 'awaiting_selection');
  assert.equal(whatsappClient.menusSent.length, 1);
  assert.equal(whatsappClient.menusSent[0].to, whatsappId);
  assert.equal(whatsappClient.menusSent[0].menu.options.length, SELECTION_OPTIONS.length);
});

test('selecionar "tenho interesse em vender" interrompe o fluxo e aciona atendimento humano', async () => {
  const { agent, whatsappClient, store, config } = setup();
  const whatsappId = '5511999990000@c.us';
  store.set(whatsappId, { name: 'Maria Silva', status: 'awaiting_selection' });

  const result = await agent.handleIncomingMessage({
    from: whatsappId,
    name: 'Maria Silva',
    selectedRowId: 'opt_interesse_vender',
    body: 'Sim, tenho interesse em vender',
  });

  assert.equal(result.action, 'handoff');
  assert.equal(store.get(whatsappId).status, 'awaiting_human');
  assert.match(whatsappClient.sent.at(-1).text, /Perfeito, Maria Silva! Vou te conectar agora com o meu time de atendimento/);

  const queue = JSON.parse(fs.readFileSync(config.handoffQueueFile, 'utf8'));
  assert.equal(queue.length, 1);
  assert.equal(queue[0].reason, 'interesse_detectado');

  whatsappClient.sent = [];
  const second = await agent.handleIncomingMessage({ from: whatsappId, name: 'Maria Silva', body: 'oi de novo' });
  assert.equal(second, null);
  assert.equal(whatsappClient.sent.length, 0);
});

test('selecionar a opção de descadastro encerra o contato e é respeitado em campanhas futuras', async () => {
  const { agent, whatsappClient, store } = setup();
  const whatsappId = '5511999990000@c.us';
  store.set(whatsappId, { name: 'Maria Silva', status: 'awaiting_selection' });

  const result = await agent.handleIncomingMessage({
    from: whatsappId,
    name: 'Maria Silva',
    selectedRowId: 'opt_parar_mensagens',
    body: 'Favor parar de enviar mensagens.',
  });

  assert.equal(result.action, 'opt_out');
  assert.equal(store.get(whatsappId).status, 'opted_out');

  whatsappClient.sent = [];
  await agent.runCampaign();
  const recipients = whatsappClient.sent.map((m) => m.to);
  assert.ok(!recipients.includes(whatsappId), 'contato que se descadastrou não pode ser recontatado');
});

test('selecionar "sem interesse" encerra a conversa educadamente', async () => {
  const { agent, whatsappClient, store } = setup();
  const whatsappId = '5511999990000@c.us';
  store.set(whatsappId, { name: 'Maria Silva', status: 'awaiting_selection' });

  const result = await agent.handleIncomingMessage({
    from: whatsappId,
    name: 'Maria Silva',
    selectedRowId: 'opt_sem_interesse',
    body: 'Não tenho interesse, obrigado',
  });

  assert.equal(result.action, 'closed');
  assert.equal(store.get(whatsappId).status, 'closed_not_interested');
});

test('resposta digitada (sem tocar na lista) também é reconhecida pelo número ou pelo texto', async () => {
  const { agent, store } = setup();
  const whatsappId = '5511999990000@c.us';

  store.set(whatsappId, { name: 'Maria Silva', status: 'awaiting_selection' });
  const byNumber = await agent.handleIncomingMessage({ from: whatsappId, name: 'Maria Silva', body: '1' });
  assert.equal(byNumber.action, 'handoff');

  store.set(whatsappId, { name: 'Maria Silva', status: 'awaiting_selection' });
  const byText = await agent.handleIncomingMessage({ from: whatsappId, name: 'Maria Silva', body: 'quero vender meu apê' });
  assert.equal(byText.action, 'handoff');
});

test('resposta fora das opções do menu aciona direto o atendimento humano, sem insistir', async () => {
  const { agent, whatsappClient, store } = setup();
  const whatsappId = '5511999990000@c.us';
  store.set(whatsappId, { name: 'Maria Silva', status: 'awaiting_selection' });

  const result = await agent.handleIncomingMessage({ from: whatsappId, name: 'Maria Silva', body: 'Oi, tudo bem?' });

  assert.equal(result.action, 'handoff');
  assert.equal(result.entry.reason, 'resposta_fora_do_menu');
  assert.equal(store.get(whatsappId).status, 'awaiting_human');
  assert.match(whatsappClient.sent.at(-1).text, /time de atendimento/);
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
