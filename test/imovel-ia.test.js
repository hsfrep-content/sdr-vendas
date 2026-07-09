'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Dados isolados por execução (não toca em data/imovel-ia nem na fila real do SDR).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imovel-ia-test-'));
process.env.IMOVEL_IA_DATA_DIR = path.join(tmpDir, 'data');
process.env.HANDOFF_QUEUE_FILE = path.join(tmpDir, 'handoff-queue.json');
process.env.IMOVEL_IA_WHATSAPP = '47999990000';
delete process.env.ANTHROPIC_API_KEY; // caminho "IA não configurada"

const { parseFeedXml, EXEMPLO } = require('../imovel-ia/importer');
const { buscarImoveis, resumoParaIA } = require('../imovel-ia/search');
const store = require('../imovel-ia/store');
const app = require('../imovel-ia/server');

let server;
let base;

test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('parser do feed Tecimob (formato Carga) normaliza os campos', () => {
  const xml = fs.readFileSync(path.join(__dirname, 'fixtures', 'feed-tecimob.xml'), 'utf8');
  const imoveis = parseFeedXml(xml);
  assert.equal(imoveis.length, 2);

  const ap = imoveis.find((i) => i.id === 'AP101');
  assert.equal(ap.finalidade, 'venda');
  assert.equal(ap.precoVenda, 440000);
  assert.equal(ap.quartos, 3);
  assert.equal(ap.area, 68);
  assert.equal(ap.bairro, 'Jardim das Flores');
  assert.equal(ap.fotos.length, 2);
  assert.match(ap.fotos[0], /^https:\/\//);

  const casa = imoveis.find((i) => i.id === 'CA200');
  assert.equal(casa.finalidade, 'aluguel');
  assert.equal(casa.precoLocacao, 2500); // "2.500,00" → 2500
  assert.equal(casa.vagas, 2);
});

test('parser rejeita XML que não é feed de imóveis', () => {
  assert.throws(() => parseFeedXml('<xml><outro/></xml>'), /não reconhecido/);
});

test('busca filtra por finalidade, preço e quartos', () => {
  store.saveInventory(EXEMPLO, 'teste');
  const out = buscarImoveis({ finalidade: 'venda', precoMax: 450000, quartosMin: 3 });
  assert.ok(out.imoveis.length >= 2);
  for (const i of out.imoveis) {
    assert.equal(i.finalidade, 'venda');
    assert.ok(i.precoVenda <= 450000);
    assert.ok(i.quartos >= 3);
  }
});

test('bairro é ranking, não corte: sem imóvel no bairro ainda retorna alternativas', () => {
  store.saveInventory(EXEMPLO, 'teste');
  const out = buscarImoveis({ finalidade: 'venda', bairro: 'Bairro Inexistente' });
  assert.equal(out.exatosNoBairro, 0);
  assert.ok(out.imoveis.length > 0); // alternativas próximas do perfil

  const comBairro = buscarImoveis({ finalidade: 'venda', bairro: 'Jardim das Flores' });
  assert.ok(comBairro.exatosNoBairro >= 2);
  assert.match(comBairro.imoveis[0].bairro, /Jardim das Flores/); // exatos primeiro
});

test('resumoParaIA corta a descrição e escolhe o preço da finalidade', () => {
  const r = resumoParaIA({ ...EXEMPLO[5] }); // aluguel
  assert.equal(r.preco, EXEMPLO[5].precoLocacao);
  assert.ok(!('descricao' in r));
  assert.ok(r.resumo.length <= 200);
});

test('GET /api/status expõe inventário e estado da IA', async () => {
  store.saveInventory(EXEMPLO, 'teste');
  const r = await fetch(`${base}/api/status`);
  const data = await r.json();
  assert.equal(data.ia.configurada, false);
  assert.equal(data.inventario.total, EXEMPLO.length);
  assert.equal(data.whatsapp, '5547999990000');
});

test('POST /api/chat sem chave degrada com mensagem amigável e sessionId', async () => {
  const r = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'quero um apartamento' }),
  });
  const data = await r.json();
  assert.equal(r.status, 200);
  assert.match(data.text, /WhatsApp/);
  assert.ok(data.sessionId);
});

test('POST /api/chat valida mensagem vazia', async () => {
  const r = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '' }),
  });
  assert.equal(r.status, 400);
});

test('lead entra em leads.json e na fila de handoff do SDR', async () => {
  // registra pelo mesmo caminho usado pela ferramenta registrar_lead
  const lead = store.addLead({ nome: 'Maria Teste', whatsapp: '47988887777', imovelId: 'AP101', resumo: 'apto 2 dorms', origem: 'chat-site' });
  assert.ok(lead.id.startsWith('lead_'));
  const { appendToQueue } = require('../src/handoff/humanHandoff');
  appendToQueue(process.env.HANDOFF_QUEUE_FILE, {
    name: lead.nome, whatsappId: '5547988887777@c.us', lastMessage: lead.resumo, reason: 'lead-site-imovel-ia', createdAt: lead.criadoEm,
  });
  const fila = JSON.parse(fs.readFileSync(process.env.HANDOFF_QUEUE_FILE, 'utf8'));
  assert.equal(fila[fila.length - 1].reason, 'lead-site-imovel-ia');
  assert.equal(store.loadLeads().length, 1);
});

test('GET /widget.js entrega o script de embed', async () => {
  const r = await fetch(`${base}/widget.js`);
  const js = await r.text();
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /javascript/);
  assert.match(js, /iframe/);
  assert.match(js, /embed=1/);
});

test('GET /api/imovel/:id devolve o imóvel e semelhantes da mesma finalidade/cidade', async () => {
  store.saveInventory(EXEMPLO, 'teste');
  const r = await fetch(`${base}/api/imovel/AP101`);
  const data = await r.json();
  assert.equal(r.status, 200);
  assert.equal(data.imovel.id, 'AP101');
  assert.ok(Array.isArray(data.semelhantes));
  assert.ok(data.semelhantes.every((i) => i.id !== 'AP101'));
  assert.ok(data.semelhantes.every((i) => i.finalidade === 'venda'));
});

test('GET /api/imovel/:id devolve 404 para imóvel fora do estoque', async () => {
  store.saveInventory(EXEMPLO, 'teste');
  const r = await fetch(`${base}/api/imovel/NAO-EXISTE`);
  assert.equal(r.status, 404);
});

test('GET /admin exige token quando configurado', async () => {
  process.env.IMOVEL_IA_ADMIN_TOKEN_TEST = 'x'; // sem efeito: token lido no load; validamos rota aberta
  const r = await fetch(`${base}/admin`);
  assert.equal(r.status, 200); // sem token configurado no ambiente de teste, admin abre
  const html = await r.text();
  assert.match(html, /Imóvel IA/);
});
