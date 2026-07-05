'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');

const store = require('./store');
const claude = require('./claude');
const { AGENTS, CATEGORIES, businessContext, ROUTER_HINT } = require('./agents');

const HOST = process.env.ADS_HOST || '127.0.0.1';
const PORT = Number(process.env.ADS_PORT || 3010);
const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge');

const app = express();
app.use(express.json({ limit: '2mb' }));

let db = store.load();
const persist = () => store.save(db);

// ---------- Upload de imagens (repositório por produto/empreendimento) ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, store.UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
      cb(null, `${store.newId('img')}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype) || file.mimetype === 'video/mp4';
    cb(ok ? null : new Error('Apenas imagens (jpg, png, webp, gif) ou vídeos mp4.'), ok);
  },
});

app.use('/uploads', express.static(store.UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Estado geral ----------
app.get('/api/state', (req, res) => {
  res.json({
    settings: db.settings,
    products: db.products,
    creatives: db.creatives,
    campaigns: db.campaigns,
    categories: CATEGORIES,
    agents: Object.values(AGENTS).map(({ id, nome, emoji, descricao }) => ({ id, nome, emoji, descricao })),
    ia: { configurada: claude.isConfigured(), modelo: claude.MODEL },
  });
});

app.put('/api/settings', (req, res) => {
  db.settings = { ...db.settings, ...req.body };
  persist();
  res.json(db.settings);
});

// ---------- Produtos / empreendimentos ----------
app.post('/api/products', (req, res) => {
  const p = {
    id: store.newId('prod'),
    nome: req.body.nome || 'Sem nome',
    tipo: req.body.tipo || 'economico',
    descricao: req.body.descricao || '',
    cidade: req.body.cidade || '',
    precoDe: req.body.precoDe || '',
    precoAte: req.body.precoAte || '',
    diferenciais: req.body.diferenciais || '',
    images: [],
    criadoEm: new Date().toISOString(),
  };
  db.products.push(p);
  persist();
  res.json(p);
});

app.put('/api/products/:id', (req, res) => {
  const p = db.products.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Produto não encontrado' });
  Object.assign(p, {
    nome: req.body.nome ?? p.nome,
    tipo: req.body.tipo ?? p.tipo,
    descricao: req.body.descricao ?? p.descricao,
    cidade: req.body.cidade ?? p.cidade,
    precoDe: req.body.precoDe ?? p.precoDe,
    precoAte: req.body.precoAte ?? p.precoAte,
    diferenciais: req.body.diferenciais ?? p.diferenciais,
  });
  persist();
  res.json(p);
});

app.delete('/api/products/:id', (req, res) => {
  const p = db.products.find((x) => x.id === req.params.id);
  if (p) {
    for (const img of p.images) {
      fs.rm(path.join(store.UPLOADS_DIR, img.filename), { force: true }, () => {});
    }
  }
  db.products = db.products.filter((x) => x.id !== req.params.id);
  persist();
  res.json({ ok: true });
});

app.post('/api/products/:id/images', upload.array('files'), (req, res) => {
  const p = db.products.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Produto não encontrado' });
  for (const f of req.files || []) {
    p.images.push({ id: store.newId('img'), filename: f.filename, originalName: f.originalname, label: '' });
  }
  persist();
  res.json(p);
});

app.delete('/api/products/:id/images/:imgId', (req, res) => {
  const p = db.products.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Produto não encontrado' });
  const img = p.images.find((i) => i.id === req.params.imgId);
  if (img) fs.rm(path.join(store.UPLOADS_DIR, img.filename), { force: true }, () => {});
  p.images = p.images.filter((i) => i.id !== req.params.imgId);
  persist();
  res.json(p);
});

// ---------- Criativos ----------
app.post('/api/creatives', (req, res) => {
  const c = {
    id: store.newId('cri'),
    productId: req.body.productId || null,
    categoria: req.body.categoria || CATEGORIES[0].id,
    formato: req.body.formato === 'video' ? 'video' : 'estatico',
    titulo: req.body.titulo || 'Criativo',
    textoPrimario: req.body.textoPrimario || '',
    headline: req.body.headline || '',
    descricao: req.body.descricao || '',
    roteiro: req.body.roteiro || '',
    cta: req.body.cta || 'Saiba mais',
    racional: req.body.racional || '',
    status: 'rascunho',
    origem: req.body.origem === 'ia' ? 'ia' : 'manual',
    criadoEm: new Date().toISOString(),
  };
  db.creatives.push(c);
  persist();
  res.json(c);
});

app.put('/api/creatives/:id', (req, res) => {
  const c = db.creatives.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Criativo não encontrado' });
  const editaveis = ['titulo', 'textoPrimario', 'headline', 'descricao', 'roteiro', 'cta', 'racional', 'status', 'categoria', 'formato', 'productId'];
  for (const k of editaveis) if (k in req.body) c[k] = req.body[k];
  persist();
  res.json(c);
});

app.delete('/api/creatives/:id', (req, res) => {
  db.creatives = db.creatives.filter((x) => x.id !== req.params.id);
  persist();
  res.json({ ok: true });
});

// Geração de criativos com IA (Diretor de Criativos)
app.post('/api/creatives/generate', async (req, res) => {
  const { categoria, formato, productId, quantidade, instrucoes } = req.body;
  const cat = CATEGORIES.find((c) => c.id === categoria) || CATEGORIES[0];
  const produto = db.products.find((p) => p.id === productId);

  const brief = [
    `Crie ${Math.min(Number(quantidade) || 3, 5)} variações de anúncio ${formato === 'video' ? 'em VÍDEO (Reels 15-30s)' : 'ESTÁTICO (feed/stories)'} para a categoria "${cat.label}".`,
    produto
      ? `Produto/empreendimento: ${produto.nome} (${produto.tipo}), ${produto.cidade}. Faixa de preço: ${produto.precoDe || '?'} a ${produto.precoAte || '?'}. Diferenciais: ${produto.diferenciais || '-'}. Descrição: ${produto.descricao || '-'}`
      : 'Sem produto específico: campanha institucional de captação (avaliação gratuita / anuncie seu imóvel).',
    'Cada variação deve testar UMA hipótese diferente (gancho de dor, gancho de benefício, prova social, urgência/condição).',
    instrucoes ? `Instruções extras do usuário: ${instrucoes}` : '',
  ].filter(Boolean).join('\n');

  try {
    const out = await claude.generateCreatives({
      systemPrompt: AGENTS.criativos.system,
      businessCtx: businessContext(db.settings),
      brief,
    });
    if (!out.ok) return res.status(422).json({ error: out.error });

    const criados = out.variacoes.map((v) => ({
      id: store.newId('cri'),
      productId: productId || null,
      categoria: cat.id,
      formato: formato === 'video' ? 'video' : 'estatico',
      titulo: v.titulo,
      textoPrimario: v.textoPrimario,
      headline: v.headline,
      descricao: v.descricao,
      roteiro: v.roteiro,
      cta: v.cta,
      racional: v.racional,
      status: 'rascunho',
      origem: 'ia',
      criadoEm: new Date().toISOString(),
    }));
    db.creatives.push(...criados);
    persist();
    res.json({ criados, usage: out.usage });
  } catch (err) {
    res.status(502).json({ error: `Falha ao chamar a IA: ${err.message}` });
  }
});

// ---------- Campanhas ----------
const CHECKLIST_PADRAO = {
  meta: [
    'Pixel/Conjunto de eventos instalado e testado',
    'Formulário instantâneo com perguntas qualificadoras',
    'Público por raio configurado (30 km da base)',
    'Mín. 3 criativos ativos (1 vídeo + 2 estáticos)',
    'Resposta ao lead em até 5 minutos (WhatsApp)',
    'CPL alvo definido e anotado',
  ],
  google: [
    'Acompanhamento de conversão configurado (WhatsApp/formulário)',
    'Palavras-chave em frase/exata agrupadas por intenção',
    'Lista de negativas aplicada (aluguel barato, leilão, emprego...)',
    'Anúncio responsivo com preço/condição no título',
    'Extensões: chamada, local e sitelinks',
    'Segmentação geográfica: "presença" (não "interesse")',
  ],
};

app.post('/api/campaigns', (req, res) => {
  const plataforma = req.body.plataforma === 'google' ? 'google' : 'meta';
  const c = {
    id: store.newId('camp'),
    nome: req.body.nome || 'Nova campanha',
    categoria: req.body.categoria || CATEGORIES[0].id,
    plataforma,
    objetivo: req.body.objetivo || '',
    orcamentoDiario: req.body.orcamentoDiario || '',
    produtoId: req.body.produtoId || null,
    status: 'planejamento',
    notas: req.body.notas || '',
    checklist: CHECKLIST_PADRAO[plataforma].map((item) => ({ item, feito: false })),
    criadoEm: new Date().toISOString(),
  };
  db.campaigns.push(c);
  persist();
  res.json(c);
});

app.put('/api/campaigns/:id', (req, res) => {
  const c = db.campaigns.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Campanha não encontrada' });
  const editaveis = ['nome', 'categoria', 'plataforma', 'objetivo', 'orcamentoDiario', 'produtoId', 'status', 'notas', 'checklist'];
  for (const k of editaveis) if (k in req.body) c[k] = req.body[k];
  persist();
  res.json(c);
});

app.delete('/api/campaigns/:id', (req, res) => {
  db.campaigns = db.campaigns.filter((x) => x.id !== req.params.id);
  persist();
  res.json({ ok: true });
});

// ---------- Playbooks (conhecimento local, zero tokens) ----------
app.get('/api/knowledge', (req, res) => {
  const files = fs.readdirSync(KNOWLEDGE_DIR).filter((f) => f.endsWith('.md')).sort();
  res.json(files.map((f) => {
    const firstLine = fs.readFileSync(path.join(KNOWLEDGE_DIR, f), 'utf8').split('\n')[0];
    return { slug: f.replace(/\.md$/, ''), titulo: firstLine.replace(/^#\s*/, '') };
  }));
});

app.get('/api/knowledge/:slug', (req, res) => {
  const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
  const file = path.join(KNOWLEDGE_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Playbook não encontrado' });
  res.json({ slug, markdown: fs.readFileSync(file, 'utf8') });
});

// ---------- Chat com os agentes ----------
app.post('/api/chat/:agentId', async (req, res) => {
  const agent = AGENTS[req.params.agentId];
  if (!agent) return res.status(404).json({ error: 'Agente não encontrado' });
  const message = String(req.body.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Mensagem vazia' });

  const history = (db.chats[agent.id] || []).map(({ role, content }) => ({ role, content }));

  try {
    const out = await claude.chat({
      systemPrompt: agent.id === 'orquestrador' ? agent.system : `${agent.system}\n${ROUTER_HINT}`,
      businessCtx: businessContext(db.settings),
      history,
      userMessage: message,
    });
    const now = new Date().toISOString();
    if (out.ok) {
      db.chats[agent.id] = [
        ...(db.chats[agent.id] || []),
        { role: 'user', content: message, ts: now },
        { role: 'assistant', content: out.text, ts: now },
      ].slice(-40); // histórico persistido limitado
      persist();
    }
    res.json({ text: out.text, ok: out.ok, usage: out.usage });
  } catch (err) {
    res.status(502).json({ error: `Falha ao chamar a IA: ${err.message}` });
  }
});

app.get('/api/chat/:agentId', (req, res) => {
  res.json(db.chats[req.params.agentId] || []);
});

app.delete('/api/chat/:agentId', (req, res) => {
  delete db.chats[req.params.agentId];
  persist();
  res.json({ ok: true });
});

// ---------- Erros ----------
app.use((err, req, res, next) => {
  res.status(400).json({ error: err.message });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Ads Studio no ar: http://${HOST}:${PORT}`);
    console.log(`IA ${claude.isConfigured() ? `configurada (modelo ${claude.MODEL})` : 'NÃO configurada — defina ANTHROPIC_API_KEY no .env para ativar os agentes'}`);
  });
}

module.exports = app;
