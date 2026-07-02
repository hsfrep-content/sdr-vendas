const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createDashboardApp } = require('../src/web/server');
const { ConversationStore } = require('../src/state/conversationStore');

class FakeWhatsAppClient {
  constructor(state = 'waiting_qr', qr = 'fake-qr-string') {
    this._state = state;
    this._qr = qr;
  }
  getState() {
    return this._state;
  }
  getLastQr() {
    return this._qr;
  }
}

function setup({ dashboardToken } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdr-dashboard-'));
  const config = {
    companyName: 'Imob X',
    defaultCountryCode: '55',
    contactsFile: path.join(dir, 'contacts.csv'),
    handoffQueueFile: path.join(dir, 'handoff-queue.json'),
    dashboardToken: dashboardToken || null,
  };
  const store = new ConversationStore(path.join(dir, 'state.json'));
  const whatsappClient = new FakeWhatsAppClient();
  const runCampaignCalls = [];
  const agent = { runCampaign: async () => runCampaignCalls.push(Date.now()) };

  const app = createDashboardApp({ config, whatsappClient, store, agent, logger: { log() {}, error() {} } });
  return { app, config, store, whatsappClient, agent, runCampaignCalls, dir };
}

async function withServer(app, fn) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET / mostra o status da conexão e o nome da empresa', async () => {
  const { app, config } = setup();
  await withServer(app, async (baseUrl) => {
    const res = await fetch(baseUrl + '/');
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, new RegExp(config.companyName));
    assert.match(html, /Aguardando leitura do QR code/);
  });
});

test('GET /qr.png retorna 404 quando não há QR code disponível', async () => {
  const { app, whatsappClient } = setup();
  whatsappClient._qr = null;
  await withServer(app, async (baseUrl) => {
    const res = await fetch(baseUrl + '/qr.png');
    assert.equal(res.status, 404);
  });
});

test('GET /qr.png retorna uma imagem PNG quando há QR code pendente', async () => {
  const { app } = setup();
  await withServer(app, async (baseUrl) => {
    const res = await fetch(baseUrl + '/qr.png');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
  });
});

test('POST /contacts salva um CSV válido e o resumo aparece na página', async () => {
  const { app, config } = setup();
  const csv = 'name,phone,consent\nMaria Silva,11999990000,sim\nAna Souza,11977776666,nao\n';

  await withServer(app, async (baseUrl) => {
    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'contatos.csv');

    const res = await fetch(baseUrl + '/contacts', { method: 'POST', body: form, redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.match(res.headers.get('location'), /notice=/);

    const saved = fs.readFileSync(config.contactsFile, 'utf8');
    assert.equal(saved, csv);

    const page = await (await fetch(baseUrl + res.headers.get('location'))).text();
    assert.match(page, /2<\/b>\s*contato\(s\) lidos/);
    assert.match(page, /1<\/b>\s*autorizado\(s\)/);
  });
});

test('POST /contacts rejeita CSV sem contatos válidos e não sobrescreve o arquivo salvo', async () => {
  const { app, config } = setup();
  fs.writeFileSync(config.contactsFile, 'name,phone,consent\nMaria,11999990000,sim\n');

  await withServer(app, async (baseUrl) => {
    const form = new FormData();
    form.append('file', new Blob(['coluna_errada\nx\n'], { type: 'text/csv' }), 'ruim.csv');

    const res = await fetch(baseUrl + '/contacts', { method: 'POST', body: form, redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.match(res.headers.get('location'), /error=/);

    const stillOriginal = fs.readFileSync(config.contactsFile, 'utf8');
    assert.match(stillOriginal, /Maria/);
  });
});

test('POST /campaign/run só dispara a campanha quando o WhatsApp está pronto', async () => {
  const { app, whatsappClient, runCampaignCalls } = setup();

  await withServer(app, async (baseUrl) => {
    const blocked = await fetch(baseUrl + '/campaign/run', { method: 'POST', redirect: 'manual' });
    assert.equal(blocked.status, 302);
    assert.match(blocked.headers.get('location'), /error=/);
    assert.equal(runCampaignCalls.length, 0);

    whatsappClient._state = 'ready';
    const allowed = await fetch(baseUrl + '/campaign/run', { method: 'POST', redirect: 'manual' });
    assert.equal(allowed.status, 302);
    assert.match(allowed.headers.get('location'), /notice=/);
    assert.equal(runCampaignCalls.length, 1);
  });
});

test('painel exige token quando DASHBOARD_TOKEN está configurado', async () => {
  const { app } = setup({ dashboardToken: 'segredo123' });

  await withServer(app, async (baseUrl) => {
    const semToken = await fetch(baseUrl + '/');
    assert.equal(semToken.status, 401);

    const comToken = await fetch(baseUrl + '/?token=segredo123');
    assert.equal(comToken.status, 200);
  });
});
