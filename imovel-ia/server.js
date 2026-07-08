'use strict';

require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');

const store = require('./store');
const ia = require('./claude');
const { appendToQueue } = require('../src/handoff/humanHandoff');

const HOST = process.env.IMOVEL_IA_HOST || '127.0.0.1';
const PORT = Number(process.env.IMOVEL_IA_PORT || 3020);
const EMPRESA = process.env.IMOVEL_IA_EMPRESA || process.env.AGENT_COMPANY_NAME || 'A&L Negócios Imobiliários';
const CIDADES = process.env.IMOVEL_IA_CIDADES || '';
const WHATSAPP = (process.env.IMOVEL_IA_WHATSAPP || process.env.HANDOFF_NOTIFY_NUMBER || '').replace(/\D/g, '');
const HANDOFF_QUEUE_FILE = process.env.HANDOFF_QUEUE_FILE || path.join(__dirname, '..', 'data', 'handoff-queue.json');
const ADMIN_TOKEN = process.env.IMOVEL_IA_ADMIN_TOKEN || '';

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Sessões de conversa (em memória, com expiração) ----------
const sessions = new Map(); // sessionId -> { history, lastAt }
const SESSION_TTL_MS = 60 * 60 * 1000;

function getSession(id) {
  const now = Date.now();
  for (const [k, s] of sessions) if (now - s.lastAt > SESSION_TTL_MS) sessions.delete(k);
  if (!id || !sessions.has(id)) {
    const novo = crypto.randomBytes(12).toString('hex');
    sessions.set(novo, { history: [], lastAt: now });
    return { id: novo, session: sessions.get(novo) };
  }
  const s = sessions.get(id);
  s.lastAt = now;
  return { id, session: s };
}

// ---------- Proteção básica do endpoint público ----------
const hits = new Map(); // ip -> [timestamps]
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 5 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 25; // 25 mensagens / 5 min / IP
}

// ---------- API ----------
app.get('/api/status', (req, res) => {
  const inv = store.loadInventory();
  res.json({
    empresa: EMPRESA,
    ia: { configurada: ia.isConfigured(), modelo: ia.MODEL },
    inventario: { total: inv.imoveis.length, atualizadoEm: inv.atualizadoEm, origem: inv.origem },
    whatsapp: WHATSAPP ? `55${WHATSAPP.replace(/^55/, '')}` : null,
  });
});

// Vitrine da home: destaques do estoque (com foto primeiro), sem custo de IA.
app.get('/api/destaques', (req, res) => {
  const { imoveis } = store.loadInventory();
  const comFoto = (l) => l.sort((a, b) => (b.fotos?.length ? 1 : 0) - (a.fotos?.length ? 1 : 0));
  const venda = comFoto(imoveis.filter((i) => i.finalidade === 'venda')).slice(0, 6);
  const aluguel = comFoto(imoveis.filter((i) => i.finalidade === 'aluguel')).slice(0, 3);
  res.json({ venda, aluguel });
});

app.post('/api/chat', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
  if (rateLimited(ip)) return res.status(429).json({ error: 'Muitas mensagens em pouco tempo. Aguarde um instante e tente de novo.' });

  const message = String(req.body.message || '').trim().slice(0, 600);
  if (!message) return res.status(400).json({ error: 'Mensagem vazia' });

  const { id: sessionId, session } = getSession(req.body.sessionId);
  const inv = store.loadInventory();

  const onLead = async (input) => {
    const lead = store.addLead({ ...input, origem: 'chat-site', sessionId });
    // Mesma fila de atendimento humano usada pelo agente SDR de WhatsApp.
    appendToQueue(HANDOFF_QUEUE_FILE, {
      name: input.nome,
      whatsappId: `${input.whatsapp.replace(/\D/g, '')}@c.us`,
      lastMessage: input.resumo || `Interesse via chat do site${input.imovelId ? ` no imóvel ${input.imovelId}` : ''}`,
      reason: 'lead-site-imovel-ia',
      createdAt: new Date().toISOString(),
    });
    return lead;
  };

  try {
    store.bumpStat('mensagens');
    const out = await ia.conversar({
      history: session.history,
      userMessage: message,
      settings: {
        empresa: EMPRESA,
        cidades: CIDADES,
        whatsapp: WHATSAPP,
        inventarioAtualizadoEm: inv.atualizadoEm,
        totalImoveis: inv.imoveis.length,
      },
      onLead,
    });

    if (out.ok && out.messages) session.history = out.messages.slice(-24);

    res.json({
      sessionId,
      text: out.text,
      imoveis: out.imoveis || {},
      leadRegistrado: Boolean(out.leadRegistrado),
      whatsapp: WHATSAPP ? `55${WHATSAPP.replace(/^55/, '')}` : null,
    });
  } catch (err) {
    res.status(502).json({ error: `O assistente teve um problema agora (${err.message}). Tente novamente em instantes.` });
  }
});

// ---------- Widget embutível ----------
app.get('/widget.js', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.type('application/javascript').send(`(function () {
  if (window.__aelWidget) return; window.__aelWidget = true;
  var btn = document.createElement('button');
  btn.id = 'ael-ia-btn';
  btn.innerHTML = '💬 <span>Buscar imóvel com IA</span>';
  btn.style.cssText = 'position:fixed;bottom:22px;right:22px;z-index:99998;display:flex;gap:8px;align-items:center;background:#16436e;color:#fff;border:0;border-radius:999px;padding:13px 20px;font:600 15px/1 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25);cursor:pointer';
  var frame = document.createElement('iframe');
  frame.src = '${base}/?embed=1';
  frame.title = 'Assistente de imóveis';
  frame.style.cssText = 'position:fixed;bottom:90px;right:22px;z-index:99999;width:min(400px,calc(100vw - 30px));height:min(620px,calc(100vh - 120px));border:0;border-radius:18px;box-shadow:0 12px 48px rgba(0,0,0,.3);display:none;background:#fff';
  var open = false;
  btn.addEventListener('click', function () {
    open = !open;
    frame.style.display = open ? 'block' : 'none';
    btn.innerHTML = open ? '✕ <span>Fechar</span>' : '💬 <span>Buscar imóvel com IA</span>';
  });
  document.body.appendChild(btn);
  document.body.appendChild(frame);
})();`);
});

// ---------- Admin ----------
app.get('/admin', (req, res) => {
  if (ADMIN_TOKEN && req.query.token !== ADMIN_TOKEN) {
    return res.status(401).send('Acesso negado. Use /admin?token=SEU_TOKEN (IMOVEL_IA_ADMIN_TOKEN no .env).');
  }
  const inv = store.loadInventory();
  const leads = store.loadLeads().slice(-50).reverse();
  const stats = store.loadStats();
  const dias = Object.keys(stats).sort().slice(-14).reverse();
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  res.type('html').send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Imóvel IA · Admin</title>
  <style>body{font-family:system-ui,sans-serif;background:#f6f7fa;color:#1d2433;margin:0;padding:30px;max-width:960px;margin:auto}
  h1{font-size:20px}h2{font-size:15px;margin-top:28px}table{border-collapse:collapse;width:100%;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)}
  th,td{padding:9px 12px;border-bottom:1px solid #e6e8ef;text-align:left;font-size:13.5px}th{background:#eef1f6}
  .cards{display:flex;gap:14px;flex-wrap:wrap}.card{background:#fff;border-radius:12px;padding:16px 20px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
  .num{font-size:24px;font-weight:800;color:#16436e}.lbl{font-size:12px;color:#5b6474}</style></head><body>
  <h1>Imóvel IA — Painel</h1>
  <div class="cards">
    <div class="card"><div class="num">${inv.imoveis.length}</div><div class="lbl">imóveis no estoque</div></div>
    <div class="card"><div class="num">${store.loadLeads().length}</div><div class="lbl">leads capturados</div></div>
    <div class="card"><div class="num">${esc(inv.atualizadoEm ? new Date(inv.atualizadoEm).toLocaleString('pt-BR') : 'nunca')}</div><div class="lbl">última importação (${esc(inv.origem || '-')})</div></div>
    <div class="card"><div class="num">${ia.isConfigured() ? 'ativa' : 'inativa'}</div><div class="lbl">IA (${esc(ia.MODEL)})</div></div>
  </div>
  <h2>Últimos leads</h2>
  <table><tr><th>Quando</th><th>Nome</th><th>WhatsApp</th><th>Imóvel</th><th>Resumo</th></tr>
  ${leads.map((l) => `<tr><td>${esc(new Date(l.criadoEm).toLocaleString('pt-BR'))}</td><td>${esc(l.nome)}</td><td>${esc(l.whatsapp)}</td><td>${esc(l.imovelId || '-')}</td><td>${esc(l.resumo || '-')}</td></tr>`).join('') || '<tr><td colspan="5">Nenhum lead ainda.</td></tr>'}
  </table>
  <h2>Uso (últimos 14 dias)</h2>
  <table><tr><th>Dia</th><th>Mensagens</th><th>Buscas</th><th>Leads</th></tr>
  ${dias.map((d) => `<tr><td>${d}</td><td>${stats[d].mensagens || 0}</td><td>${stats[d].buscas || 0}</td><td>${stats[d].leads || 0}</td></tr>`).join('') || '<tr><td colspan="4">Sem uso registrado.</td></tr>'}
  </table></body></html>`);
});

app.use((err, req, res, next) => {
  res.status(400).json({ error: err.message });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    const inv = store.loadInventory();
    console.log(`Imóvel IA no ar: http://${HOST}:${PORT}`);
    console.log(`Estoque: ${inv.imoveis.length} imóveis (${inv.origem || 'nenhuma importação ainda — rode: node imovel-ia/importer.js --exemplo'})`);
    console.log(`IA ${ia.isConfigured() ? `ativa (${ia.MODEL})` : 'INATIVA — defina ANTHROPIC_API_KEY no .env'}`);
  });
}

module.exports = app;
