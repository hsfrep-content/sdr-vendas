'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Dados isolados por execução de teste (não toca em data/ads-studio real).
process.env.ADS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-studio-test-'));
delete process.env.ANTHROPIC_API_KEY; // garante o caminho "IA não configurada"

const app = require('../ads-studio/server');

let server;
let base;

test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
  fs.rmSync(process.env.ADS_DATA_DIR, { recursive: true, force: true });
});

async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(base + url, opts);
  return { status: r.status, data: await r.json() };
}

test('GET /api/state devolve categorias, agentes e status da IA', async () => {
  const { status, data } = await api('GET', '/api/state');
  assert.equal(status, 200);
  assert.equal(data.categories.length, 6);
  assert.equal(data.agents.length, 5);
  assert.equal(data.ia.configurada, false);
  assert.ok(data.settings.verbaGoogle >= 0);
});

test('PUT /api/settings persiste o contexto do negócio', async () => {
  const { data } = await api('PUT', '/api/settings', { cidadeBase: 'Itajaí - SC', verbaGoogle: 1100 });
  assert.equal(data.cidadeBase, 'Itajaí - SC');
  const { data: state } = await api('GET', '/api/state');
  assert.equal(state.settings.cidadeBase, 'Itajaí - SC');
});

test('CRUD de produtos', async () => {
  const { data: p } = await api('POST', '/api/products', { nome: 'Residencial Teste', tipo: 'economico', cidade: 'Itajaí' });
  assert.ok(p.id.startsWith('prod_'));
  assert.deepEqual(p.images, []);

  const { data: upd } = await api('PUT', `/api/products/${p.id}`, { nome: 'Residencial Novo Nome' });
  assert.equal(upd.nome, 'Residencial Novo Nome');
  assert.equal(upd.cidade, 'Itajaí'); // campos não enviados são preservados

  const notFound = await api('PUT', '/api/products/prod_inexistente', { nome: 'x' });
  assert.equal(notFound.status, 404);

  await api('DELETE', `/api/products/${p.id}`);
  const { data: state } = await api('GET', '/api/state');
  assert.equal(state.products.length, 0);
});

test('upload de imagem entra no repositório do produto', async () => {
  const { data: p } = await api('POST', '/api/products', { nome: 'Com Fotos' });
  // PNG 1x1 válido
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  const fd = new FormData();
  fd.append('files', new Blob([png], { type: 'image/png' }), 'foto.png');
  const r = await fetch(`${base}/api/products/${p.id}/images`, { method: 'POST', body: fd });
  const withImg = await r.json();
  assert.equal(r.status, 200);
  assert.equal(withImg.images.length, 1);
  assert.equal(withImg.images[0].originalName, 'foto.png');

  // arquivo servido em /uploads
  const img = await fetch(`${base}/uploads/${withImg.images[0].filename}`);
  assert.equal(img.status, 200);

  // remoção da imagem
  const del = await api('DELETE', `/api/products/${p.id}/images/${withImg.images[0].id}`);
  assert.equal(del.data.images.length, 0);
  await api('DELETE', `/api/products/${p.id}`);
});

test('upload rejeita tipo de arquivo não permitido', async () => {
  const { data: p } = await api('POST', '/api/products', { nome: 'Rejeita PDF' });
  const fd = new FormData();
  fd.append('files', new Blob([Buffer.from('%PDF-1.4')], { type: 'application/pdf' }), 'doc.pdf');
  const r = await fetch(`${base}/api/products/${p.id}/images`, { method: 'POST', body: fd });
  assert.equal(r.status, 400);
  await api('DELETE', `/api/products/${p.id}`);
});

test('CRUD de criativos e mudança de status', async () => {
  const { data: c } = await api('POST', '/api/creatives', {
    titulo: 'Gancho dor', categoria: 'vendas', formato: 'video', textoPrimario: 'Saia do aluguel', origem: 'manual',
  });
  assert.equal(c.status, 'rascunho');
  assert.equal(c.formato, 'video');

  const { data: upd } = await api('PUT', `/api/creatives/${c.id}`, { status: 'aprovado' });
  assert.equal(upd.status, 'aprovado');

  await api('DELETE', `/api/creatives/${c.id}`);
  const { data: state } = await api('GET', '/api/state');
  assert.equal(state.creatives.length, 0);
});

test('campanha nasce com checklist da plataforma certa', async () => {
  const { data: meta } = await api('POST', '/api/campaigns', { nome: 'Captação', plataforma: 'meta', categoria: 'captacao-vendedores' });
  assert.equal(meta.checklist.length, 6);
  assert.match(meta.checklist.map((i) => i.item).join(' '), /Formulário instantâneo/);

  const { data: google } = await api('POST', '/api/campaigns', { nome: 'Fundo de funil', plataforma: 'google' });
  assert.match(google.checklist.map((i) => i.item).join(' '), /negativas/);

  // marcar item do checklist
  meta.checklist[0].feito = true;
  const { data: upd } = await api('PUT', `/api/campaigns/${meta.id}`, { checklist: meta.checklist });
  assert.equal(upd.checklist[0].feito, true);

  await api('DELETE', `/api/campaigns/${meta.id}`);
  await api('DELETE', `/api/campaigns/${google.id}`);
});

test('playbooks são listados e servidos', async () => {
  const { data: list } = await api('GET', '/api/knowledge');
  assert.equal(list.length, 5);
  const { data: doc } = await api('GET', `/api/knowledge/${list[2].slug}`);
  assert.match(doc.markdown, /1\.100/);
  const missing = await api('GET', '/api/knowledge/nao-existe');
  assert.equal(missing.status, 404);
});

test('chat sem ANTHROPIC_API_KEY degrada com mensagem clara e não persiste histórico', async () => {
  const { status, data } = await api('POST', '/api/chat/orquestrador', { message: 'olá' });
  assert.equal(status, 200);
  assert.equal(data.ok, false);
  assert.match(data.text, /ANTHROPIC_API_KEY/);
  const { data: hist } = await api('GET', '/api/chat/orquestrador');
  assert.equal(hist.length, 0);
});

test('geração de criativos sem chave devolve 422 com orientação', async () => {
  const { status, data } = await api('POST', '/api/creatives/generate', { categoria: 'vendas', formato: 'estatico' });
  assert.equal(status, 422);
  assert.match(data.error, /ANTHROPIC_API_KEY/);
});

test('agente inexistente no chat devolve 404', async () => {
  const { status } = await api('POST', '/api/chat/nao-existe', { message: 'oi' });
  assert.equal(status, 404);
});
