'use strict';

// Ads Studio — SPA leve, sem dependências.
let state = null;
let currentView = 'overview';
let currentAgent = 'orquestrador';
let criFilters = { categoria: '', status: '', formato: '' };

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const VIEW_TITLES = {
  overview: 'Visão Geral',
  agents: 'Agentes de IA',
  products: 'Empreendimentos & Produtos',
  creatives: 'Repositório de Criativos',
  campaigns: 'Campanhas',
  knowledge: 'Playbooks',
  settings: 'Contexto do Negócio',
};

const STATUS_LABELS = {
  rascunho: ['Rascunho', 'gray'], testando: ['Testando', 'blue'], aprovado: ['Aprovado', 'green'], pausado: ['Pausado', 'red'],
  planejamento: ['Planejamento', 'gray'], ativa: ['Ativa', 'green'], pausada: ['Pausada', 'red'], encerrada: ['Encerrada', 'gray'],
};

const TIPOS_PRODUTO = {
  'media-alta': 'Média-alta renda', economico: 'Ticket econômico', captacao: 'Captação (institucional)', litoral: 'Litoral',
};

// ---------------- utilidades ----------------
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add('hidden'), 3200);
}

async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Erro ${r.status}`);
  return data;
}

async function refresh() {
  state = await api('GET', '/api/state');
  renderIaStatus();
  render();
}

function renderIaStatus() {
  const el = $('#ia-status');
  el.innerHTML = state.ia.configurada
    ? `<span class="dot on"></span>IA conectada<br><span style="opacity:.75">${esc(state.ia.modelo)}</span>`
    : `<span class="dot off"></span>IA desativada<br><span style="opacity:.75">Defina ANTHROPIC_API_KEY no .env</span>`;
}

// Mini-renderizador de Markdown (títulos, listas, tabelas, negrito, código, citações)
function mdToHtml(md) {
  const lines = md.split('\n');
  let html = '', inUl = false, inOl = false, inTable = false, inQuote = false;
  const closeAll = () => {
    if (inUl) { html += '</ul>'; inUl = false; }
    if (inOl) { html += '</ol>'; inOl = false; }
    if (inTable) { html += '</table>'; inTable = false; }
    if (inQuote) { html += '</blockquote>'; inQuote = false; }
  };
  const inline = (s) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (/^\s*$/.test(line)) { closeAll(); continue; }
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)/))) { closeAll(); html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; continue; }
    if (/^\|.*\|$/.test(line)) {
      if (/^\|[\s:|-]+\|$/.test(line)) continue; // separador
      const cells = line.slice(1, -1).split('|').map((c) => inline(c.trim()));
      if (!inTable) { closeAll(); html += `<table><tr>${cells.map((c) => `<th>${c}</th>`).join('')}</tr>`; inTable = true; }
      else html += `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
      continue;
    }
    if ((m = line.match(/^>\s?(.*)/))) {
      if (!inQuote) { closeAll(); html += '<blockquote>'; inQuote = true; }
      html += `<p>${inline(m[1])}</p>`; continue;
    }
    if ((m = line.match(/^[-*]\s+(.*)/))) {
      if (!inUl) { closeAll(); html += '<ul>'; inUl = true; }
      html += `<li>${inline(m[1])}</li>`; continue;
    }
    if ((m = line.match(/^\d+[.)]\s+(.*)/))) {
      if (!inOl) { closeAll(); html += '<ol>'; inOl = true; }
      html += `<li>${inline(m[1])}</li>`; continue;
    }
    closeAll();
    html += `<p>${inline(line)}</p>`;
  }
  closeAll();
  return html;
}

function modal(innerHtml, onMount) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal">${innerHtml}</div></div>`;
  $('.modal-backdrop', root).addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });
  if (onMount) onMount(root);
}
function closeModal() { $('#modal-root').innerHTML = ''; }

const catLabel = (id) => (state.categories.find((c) => c.id === id) || {}).label || id;
const prodName = (id) => (state.products.find((p) => p.id === id) || {}).nome || '—';
const badge = (status) => { const [lbl, cor] = STATUS_LABELS[status] || [status, 'gray']; return `<span class="badge ${cor}">${lbl}</span>`; };

// ---------------- navegação ----------------
$$('.nav-item').forEach((btn) => btn.addEventListener('click', () => {
  currentView = btn.dataset.view;
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b === btn));
  render();
}));

function render() {
  $('#view-title').textContent = VIEW_TITLES[currentView];
  $('#topbar-actions').innerHTML = '';
  const view = $('#view');
  ({ overview: renderOverview, agents: renderAgents, products: renderProducts, creatives: renderCreatives,
     campaigns: renderCampaigns, knowledge: renderKnowledge, settings: renderSettings }[currentView])(view);
}

// ---------------- Visão geral ----------------
function renderOverview(view) {
  const porCategoria = state.categories.map((cat) => {
    const camps = state.campaigns.filter((c) => c.categoria === cat.id);
    const cris = state.creatives.filter((c) => c.categoria === cat.id);
    return { cat, camps, cris };
  });
  const aprovados = state.creatives.filter((c) => c.status === 'aprovado').length;
  const ativas = state.campaigns.filter((c) => c.status === 'ativa').length;

  view.innerHTML = `
    <div class="grid cols-4">
      <div class="card stat"><div class="num">${state.products.length}</div><div class="lbl">Empreendimentos / produtos</div></div>
      <div class="card stat"><div class="num">${state.creatives.length}</div><div class="lbl">Criativos no repositório (${aprovados} aprovados)</div></div>
      <div class="card stat"><div class="num">${state.campaigns.length}</div><div class="lbl">Campanhas (${ativas} ativas)</div></div>
      <div class="card stat"><div class="num">R$ ${esc(state.settings.verbaGoogle || 0)}</div><div class="lbl">Verba Google disponível</div></div>
    </div>

    <div class="section-title">Frentes de trabalho</div>
    <div class="card">
      ${porCategoria.map(({ cat, camps, cris }) => `
        <div class="cat-row">
          <div>
            <div class="cat-name">${esc(cat.label)}</div>
            <div class="muted">${camps.length} campanha(s) · ${cris.length} criativo(s)</div>
          </div>
          <span class="badge ${cat.plataforma === 'meta' ? 'blue' : 'gold'}">${cat.plataforma === 'meta' ? 'Meta Ads' : 'Meta + Google'}</span>
        </div>`).join('')}
    </div>

    <div class="section-title">Comece por aqui</div>
    <div class="grid cols-3">
      <div class="card card-pad">
        <h3 style="font-size:14.5px;margin-bottom:6px">1 · Preencha o contexto</h3>
        <p class="muted" style="margin-bottom:12px">Cidade-base, produtos e verbas alimentam todos os agentes de IA.</p>
        <button class="btn primary sm" onclick="goto('settings')">Abrir contexto</button>
      </div>
      <div class="card card-pad">
        <h3 style="font-size:14.5px;margin-bottom:6px">2 · Leia os playbooks</h3>
        <p class="muted" style="margin-bottom:12px">Estratégia completa de Meta, Google (plano dos R$ 1.100), criativos e otimização.</p>
        <button class="btn primary sm" onclick="goto('knowledge')">Abrir playbooks</button>
      </div>
      <div class="card card-pad">
        <h3 style="font-size:14.5px;margin-bottom:6px">3 · Gere criativos com IA</h3>
        <p class="muted" style="margin-bottom:12px">Cadastre um empreendimento, suba as fotos e peça variações ao Diretor de Criativos.</p>
        <button class="btn primary sm" onclick="goto('creatives')">Abrir criativos</button>
      </div>
    </div>`;
}
window.goto = (v) => { currentView = v; $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === v)); render(); };

// ---------------- Contexto (settings) ----------------
function renderSettings(view) {
  const s = state.settings;
  view.innerHTML = `
    <div class="card card-pad" style="max-width:720px">
      <p class="muted" style="margin-bottom:16px">Estas informações são injetadas (de forma compacta) em toda conversa com os agentes — preencha uma vez e todos passam a conhecer o seu negócio.</p>
      <div class="field"><label>Nome da empresa</label><input id="s-empresa" value="${esc(s.empresa)}"></div>
      <div class="field-row">
        <div class="field"><label>Cidade / endereço-base (centro do raio)</label><input id="s-cidade" value="${esc(s.cidadeBase)}" placeholder="Ex.: Centro, Itajaí - SC"></div>
        <div class="field"><label>Raio de atuação (km)</label><input id="s-raio" type="number" value="${esc(s.raioKm)}"></div>
      </div>
      <div class="field"><label>Produto média-alta renda (nome + resumo)</label><input id="s-prodA" value="${esc(s.produtoMediaAlta)}" placeholder="Ex.: Residencial Vista Mar — 3 suítes, frente mar"></div>
      <div class="field"><label>Produto ticket econômico (nome + resumo)</label><input id="s-prodB" value="${esc(s.produtoEconomico)}" placeholder="Ex.: Parque das Flores — 2 dorms, MCMV, renda até R$ 8 mil"></div>
      <div class="field-row">
        <div class="field"><label>Verba disponível no Google (R$)</label><input id="s-google" type="number" value="${esc(s.verbaGoogle)}"></div>
        <div class="field"><label>Verba diária no Meta (R$, opcional)</label><input id="s-meta" value="${esc(s.verbaMetaDiaria)}"></div>
      </div>
      <div class="field"><label>Observações (qualquer coisa que os agentes devam saber)</label><textarea id="s-obs">${esc(s.observacoes)}</textarea></div>
      <div class="modal-actions" style="justify-content:flex-start">
        <button class="btn primary" id="s-save">Salvar contexto</button>
      </div>
    </div>`;
  $('#s-save').addEventListener('click', async () => {
    state.settings = await api('PUT', '/api/settings', {
      empresa: $('#s-empresa').value, cidadeBase: $('#s-cidade').value, raioKm: Number($('#s-raio').value) || 30,
      produtoMediaAlta: $('#s-prodA').value, produtoEconomico: $('#s-prodB').value,
      verbaGoogle: Number($('#s-google').value) || 0, verbaMetaDiaria: $('#s-meta').value, observacoes: $('#s-obs').value,
    });
    toast('Contexto salvo. Todos os agentes já enxergam as novas informações.');
  });
}

// ---------------- Produtos ----------------
function renderProducts(view) {
  $('#topbar-actions').innerHTML = '<button class="btn primary" id="add-prod">+ Novo empreendimento</button>';
  $('#add-prod').addEventListener('click', () => productModal());

  if (!state.products.length) {
    view.innerHTML = '<div class="empty">Nenhum empreendimento cadastrado.<br>Cadastre os seus 2 produtos (média-alta renda e ticket econômico) e suba as imagens — elas viram o repositório dos criativos.</div>';
    return;
  }
  view.innerHTML = `<div class="grid cols-3">${state.products.map((p) => `
    <div class="card prod-card">
      <div class="prod-cover">${p.images[0] ? `<img src="/uploads/${esc(p.images[0].filename)}" alt="">` : '⌂'}</div>
      <div class="prod-body">
        <h3>${esc(p.nome)}</h3>
        <div class="cri-meta" style="margin-bottom:6px">
          <span class="badge gold">${esc(TIPOS_PRODUTO[p.tipo] || p.tipo)}</span>
          ${p.cidade ? `<span class="badge gray">${esc(p.cidade)}</span>` : ''}
        </div>
        <div class="muted">${esc(p.descricao || 'Sem descrição')}</div>
        <div class="muted" style="margin-top:6px">${p.images.length} imagem(ns) no repositório</div>
      </div>
      <div class="prod-foot">
        <button class="btn sm" onclick="productModal('${p.id}')">Editar & imagens</button>
        <button class="btn sm danger" onclick="delProduct('${p.id}')">Excluir</button>
      </div>
    </div>`).join('')}</div>`;
}

window.delProduct = async (id) => {
  if (!confirm('Excluir este empreendimento e suas imagens?')) return;
  await api('DELETE', `/api/products/${id}`);
  await refresh();
  toast('Empreendimento excluído.');
};

window.productModal = (id) => {
  const p = state.products.find((x) => x.id === id) || { nome: '', tipo: 'economico', descricao: '', cidade: '', precoDe: '', precoAte: '', diferenciais: '', images: [] };
  modal(`
    <h2>${id ? 'Editar empreendimento' : 'Novo empreendimento'}</h2>
    <div class="field"><label>Nome</label><input id="p-nome" value="${esc(p.nome)}"></div>
    <div class="field-row">
      <div class="field"><label>Tipo</label>
        <select id="p-tipo">${Object.entries(TIPOS_PRODUTO).map(([v, l]) => `<option value="${v}" ${p.tipo === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Cidade / bairro</label><input id="p-cidade" value="${esc(p.cidade)}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Preço de (R$)</label><input id="p-de" value="${esc(p.precoDe)}"></div>
      <div class="field"><label>Preço até (R$)</label><input id="p-ate" value="${esc(p.precoAte)}"></div>
    </div>
    <div class="field"><label>Descrição</label><textarea id="p-desc">${esc(p.descricao)}</textarea></div>
    <div class="field"><label>Diferenciais (vírgula)</label><input id="p-dif" value="${esc(p.diferenciais)}" placeholder="Ex.: frente mar, 2 vagas, lazer completo, aceita FGTS"></div>
    ${id ? `
      <div class="field"><label>Repositório de imagens / vídeos</label>
        <input type="file" id="p-files" multiple accept="image/*,video/mp4">
        <div class="thumbs" id="p-thumbs">${p.images.map((img) => `
          <div class="thumb">${/\.mp4$/i.test(img.filename) ? `<video src="/uploads/${esc(img.filename)}"></video>` : `<img src="/uploads/${esc(img.filename)}" title="${esc(img.originalName)}">`}
          <button class="x" onclick="delImage('${id}','${img.id}')">✕</button></div>`).join('')}
        </div>
      </div>` : '<p class="muted">Salve primeiro para liberar o upload de imagens.</p>'}
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="p-save">Salvar</button>
    </div>
  `, (root) => {
    $('#p-save', root).addEventListener('click', async () => {
      const body = {
        nome: $('#p-nome').value, tipo: $('#p-tipo').value, cidade: $('#p-cidade').value,
        precoDe: $('#p-de').value, precoAte: $('#p-ate').value, descricao: $('#p-desc').value, diferenciais: $('#p-dif').value,
      };
      const saved = id ? await api('PUT', `/api/products/${id}`, body) : await api('POST', '/api/products', body);
      const filesInput = $('#p-files');
      if (filesInput && filesInput.files.length) {
        const fd = new FormData();
        for (const f of filesInput.files) fd.append('files', f);
        await api('POST', `/api/products/${saved.id}/images`, fd);
      }
      closeModal();
      await refresh();
      toast('Empreendimento salvo.');
      if (!id) productModal(saved.id); // reabre para permitir upload
    });
  });
};

window.delImage = async (pid, imgId) => {
  await api('DELETE', `/api/products/${pid}/images/${imgId}`);
  await refresh();
  productModal(pid);
};

// ---------------- Criativos ----------------
function renderCreatives(view) {
  $('#topbar-actions').innerHTML = `
    <button class="btn" id="add-cri">+ Criativo manual</button>
    <button class="btn gold" id="gen-cri">✦ Gerar com IA</button>`;
  $('#add-cri').addEventListener('click', () => creativeModal());
  $('#gen-cri').addEventListener('click', () => generateModal());

  const list = state.creatives.filter((c) =>
    (!criFilters.categoria || c.categoria === criFilters.categoria) &&
    (!criFilters.status || c.status === criFilters.status) &&
    (!criFilters.formato || c.formato === criFilters.formato));

  view.innerHTML = `
    <div class="filters">
      <select id="f-cat"><option value="">Todas as categorias</option>${state.categories.map((c) => `<option value="${c.id}" ${criFilters.categoria === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>
      <select id="f-status"><option value="">Todos os status</option>${['rascunho', 'testando', 'aprovado', 'pausado'].map((s) => `<option value="${s}" ${criFilters.status === s ? 'selected' : ''}>${STATUS_LABELS[s][0]}</option>`).join('')}</select>
      <select id="f-formato"><option value="">Estático + vídeo</option><option value="estatico" ${criFilters.formato === 'estatico' ? 'selected' : ''}>Estático</option><option value="video" ${criFilters.formato === 'video' ? 'selected' : ''}>Vídeo</option></select>
    </div>
    ${!list.length
      ? '<div class="empty">Nenhum criativo aqui ainda.<br>Use <b>✦ Gerar com IA</b> para o Diretor de Criativos produzir variações prontas para testar.</div>'
      : `<div class="grid cols-3">${list.map(criCard).join('')}</div>`}`;

  $('#f-cat').addEventListener('change', (e) => { criFilters.categoria = e.target.value; renderCreatives(view); });
  $('#f-status').addEventListener('change', (e) => { criFilters.status = e.target.value; renderCreatives(view); });
  $('#f-formato').addEventListener('change', (e) => { criFilters.formato = e.target.value; renderCreatives(view); });
}

function criCard(c) {
  return `
  <div class="card cri-card">
    <div class="cri-head">
      <div class="cri-title">${esc(c.titulo)}</div>
      ${badge(c.status)}
    </div>
    <div class="cri-meta">
      <span class="badge blue">${esc(catLabel(c.categoria))}</span>
      <span class="badge gray">${c.formato === 'video' ? '🎬 Vídeo' : '🖼 Estático'}</span>
      ${c.productId ? `<span class="badge gold">${esc(prodName(c.productId))}</span>` : ''}
      ${c.origem === 'ia' ? '<span class="badge gold">IA</span>' : ''}
    </div>
    <div class="cri-copy"><b>Texto:</b> ${esc(c.textoPrimario)}\n<b>Headline:</b> ${esc(c.headline)} · <b>CTA:</b> ${esc(c.cta)}</div>
    ${c.roteiro ? `<div class="cri-copy"><b>${c.formato === 'video' ? 'Roteiro' : 'Arte'}:</b> ${esc(c.roteiro)}</div>` : ''}
    ${c.racional ? `<div class="muted">💡 ${esc(c.racional)}</div>` : ''}
    <div class="cri-foot">
      <select class="btn sm" onchange="setCriStatus('${c.id}', this.value)">
        ${['rascunho', 'testando', 'aprovado', 'pausado'].map((s) => `<option value="${s}" ${c.status === s ? 'selected' : ''}>${STATUS_LABELS[s][0]}</option>`).join('')}
      </select>
      <button class="btn sm" onclick="copyCreative('${c.id}')">Copiar</button>
      <button class="btn sm" onclick="creativeModal('${c.id}')">Editar</button>
      <button class="btn sm danger" onclick="delCreative('${c.id}')">✕</button>
    </div>
  </div>`;
}

window.setCriStatus = async (id, status) => { await api('PUT', `/api/creatives/${id}`, { status }); await refresh(); };
window.delCreative = async (id) => { await api('DELETE', `/api/creatives/${id}`); await refresh(); toast('Criativo removido.'); };
window.copyCreative = (id) => {
  const c = state.creatives.find((x) => x.id === id);
  navigator.clipboard.writeText(`TEXTO PRIMÁRIO:\n${c.textoPrimario}\n\nHEADLINE: ${c.headline}\nDESCRIÇÃO: ${c.descricao}\nCTA: ${c.cta}${c.roteiro ? `\n\nROTEIRO/ARTE:\n${c.roteiro}` : ''}`);
  toast('Copiado! Cole direto no Gerenciador de Anúncios.');
};

window.creativeModal = (id) => {
  const c = state.creatives.find((x) => x.id === id) || { categoria: state.categories[0].id, formato: 'estatico', titulo: '', textoPrimario: '', headline: '', descricao: '', roteiro: '', cta: 'Saiba mais', productId: '' };
  modal(`
    <h2>${id ? 'Editar criativo' : 'Novo criativo'}</h2>
    <div class="field"><label>Nome interno</label><input id="c-titulo" value="${esc(c.titulo)}"></div>
    <div class="field-row">
      <div class="field"><label>Categoria</label><select id="c-cat">${state.categories.map((k) => `<option value="${k.id}" ${c.categoria === k.id ? 'selected' : ''}>${esc(k.label)}</option>`).join('')}</select></div>
      <div class="field"><label>Formato</label><select id="c-formato"><option value="estatico" ${c.formato === 'estatico' ? 'selected' : ''}>Estático</option><option value="video" ${c.formato === 'video' ? 'selected' : ''}>Vídeo</option></select></div>
    </div>
    <div class="field"><label>Empreendimento (opcional)</label><select id="c-prod"><option value="">— Institucional / captação —</option>${state.products.map((p) => `<option value="${p.id}" ${c.productId === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></div>
    <div class="field"><label>Texto primário</label><textarea id="c-texto">${esc(c.textoPrimario)}</textarea></div>
    <div class="field-row">
      <div class="field"><label>Headline (até 40)</label><input id="c-head" value="${esc(c.headline)}"></div>
      <div class="field"><label>CTA</label><input id="c-cta" value="${esc(c.cta)}"></div>
    </div>
    <div class="field"><label>Descrição (até 30)</label><input id="c-desc" value="${esc(c.descricao)}"></div>
    <div class="field"><label>Roteiro (vídeo) ou instrução de arte (estático)</label><textarea id="c-rot">${esc(c.roteiro)}</textarea></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="c-save">Salvar</button>
    </div>
  `, (root) => {
    $('#c-save', root).addEventListener('click', async () => {
      const body = {
        titulo: $('#c-titulo').value, categoria: $('#c-cat').value, formato: $('#c-formato').value,
        productId: $('#c-prod').value || null, textoPrimario: $('#c-texto').value, headline: $('#c-head').value,
        cta: $('#c-cta').value, descricao: $('#c-desc').value, roteiro: $('#c-rot').value,
      };
      if (id) await api('PUT', `/api/creatives/${id}`, body);
      else await api('POST', '/api/creatives', body);
      closeModal();
      await refresh();
      toast('Criativo salvo.');
    });
  });
};

window.generateModal = () => {
  modal(`
    <h2>✦ Gerar criativos com o Diretor de Criativos</h2>
    <div class="field-row">
      <div class="field"><label>Categoria</label><select id="g-cat">${state.categories.map((k) => `<option value="${k.id}">${esc(k.label)}</option>`).join('')}</select></div>
      <div class="field"><label>Formato</label><select id="g-formato"><option value="estatico">Estático</option><option value="video">Vídeo (Reels)</option></select></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Empreendimento</label><select id="g-prod"><option value="">— Institucional / captação —</option>${state.products.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></div>
      <div class="field"><label>Quantidade de variações</label><select id="g-qtd"><option>3</option><option>4</option><option>5</option></select></div>
    </div>
    <div class="field"><label>Instruções extras (opcional)</label><textarea id="g-inst" placeholder="Ex.: focar em FGTS e entrada parcelada; tom informal"></textarea></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn gold" id="g-go">Gerar variações</button>
    </div>
  `, (root) => {
    $('#g-go', root).addEventListener('click', async () => {
      const btn = $('#g-go', root);
      btn.disabled = true; btn.textContent = 'Gerando... (10-30s)';
      try {
        const out = await api('POST', '/api/creatives/generate', {
          categoria: $('#g-cat').value, formato: $('#g-formato').value,
          productId: $('#g-prod').value || null, quantidade: Number($('#g-qtd').value), instrucoes: $('#g-inst').value,
        });
        closeModal();
        await refresh();
        toast(`${out.criados.length} variações criadas no repositório (status: rascunho).`);
      } catch (err) {
        btn.disabled = false; btn.textContent = 'Gerar variações';
        toast(err.message);
      }
    });
  });
};

// ---------------- Campanhas ----------------
function renderCampaigns(view) {
  $('#topbar-actions').innerHTML = '<button class="btn primary" id="add-camp">+ Nova campanha</button>';
  $('#add-camp').addEventListener('click', () => campaignModal());

  if (!state.campaigns.length) {
    view.innerHTML = '<div class="empty">Nenhuma campanha planejada.<br>Crie uma campanha por frente de trabalho — cada uma nasce com um checklist técnico de lançamento.</div>';
    return;
  }
  view.innerHTML = `<div class="grid cols-3">${state.campaigns.map((c) => {
    const done = c.checklist.filter((i) => i.feito).length;
    const pct = c.checklist.length ? Math.round((done / c.checklist.length) * 100) : 0;
    return `
    <div class="card camp-card">
      <div class="camp-head">
        <div>
          <div class="cri-title">${esc(c.nome)}</div>
          <div class="cri-meta" style="margin-top:5px">
            <span class="badge ${c.plataforma === 'meta' ? 'blue' : 'gold'}">${c.plataforma === 'meta' ? 'Meta Ads' : 'Google Ads'}</span>
            <span class="badge gray">${esc(catLabel(c.categoria))}</span>
            ${badge(c.status)}
          </div>
        </div>
      </div>
      ${c.orcamentoDiario ? `<div class="muted" style="margin-top:8px">Orçamento: R$ ${esc(c.orcamentoDiario)}/dia${c.produtoId ? ` · ${esc(prodName(c.produtoId))}` : ''}</div>` : ''}
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="muted" style="margin-top:4px">${done}/${c.checklist.length} itens do checklist</div>
      <div class="checklist">
        ${c.checklist.map((item, i) => `
          <label><input type="checkbox" ${item.feito ? 'checked' : ''} onchange="toggleCheck('${c.id}', ${i}, this.checked)">
          <span class="${item.feito ? 'done' : ''}">${esc(item.item)}</span></label>`).join('')}
      </div>
      ${c.notas ? `<div class="cri-copy" style="margin-top:10px"><b>Notas:</b> ${esc(c.notas)}</div>` : ''}
      <div class="cri-foot" style="margin-top:10px">
        <select class="btn sm" onchange="setCampStatus('${c.id}', this.value)">
          ${['planejamento', 'ativa', 'pausada', 'encerrada'].map((s) => `<option value="${s}" ${c.status === s ? 'selected' : ''}>${STATUS_LABELS[s][0]}</option>`).join('')}
        </select>
        <button class="btn sm" onclick="campaignModal('${c.id}')">Editar</button>
        <button class="btn sm danger" onclick="delCampaign('${c.id}')">✕</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}

window.toggleCheck = async (id, index, feito) => {
  const c = state.campaigns.find((x) => x.id === id);
  c.checklist[index].feito = feito;
  await api('PUT', `/api/campaigns/${id}`, { checklist: c.checklist });
  await refresh();
};
window.setCampStatus = async (id, status) => { await api('PUT', `/api/campaigns/${id}`, { status }); await refresh(); };
window.delCampaign = async (id) => { if (confirm('Excluir campanha?')) { await api('DELETE', `/api/campaigns/${id}`); await refresh(); } };

window.campaignModal = (id) => {
  const c = state.campaigns.find((x) => x.id === id) || { nome: '', categoria: state.categories[0].id, plataforma: 'meta', objetivo: '', orcamentoDiario: '', produtoId: '', notas: '' };
  modal(`
    <h2>${id ? 'Editar campanha' : 'Nova campanha'}</h2>
    <div class="field"><label>Nome</label><input id="k-nome" value="${esc(c.nome)}" placeholder="Ex.: Captação Venda — Formulário — Raio 30km"></div>
    <div class="field-row">
      <div class="field"><label>Categoria</label><select id="k-cat">${state.categories.map((k) => `<option value="${k.id}" ${c.categoria === k.id ? 'selected' : ''}>${esc(k.label)}</option>`).join('')}</select></div>
      <div class="field"><label>Plataforma</label><select id="k-plat" ${id ? 'disabled' : ''}><option value="meta" ${c.plataforma === 'meta' ? 'selected' : ''}>Meta Ads</option><option value="google" ${c.plataforma === 'google' ? 'selected' : ''}>Google Ads</option></select></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Orçamento diário (R$)</label><input id="k-orc" value="${esc(c.orcamentoDiario)}"></div>
      <div class="field"><label>Empreendimento (opcional)</label><select id="k-prod"><option value="">—</option>${state.products.map((p) => `<option value="${p.id}" ${c.produtoId === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Objetivo / oferta</label><input id="k-obj" value="${esc(c.objetivo)}" placeholder="Ex.: Cadastro — avaliação gratuita do imóvel"></div>
    <div class="field"><label>Notas / métricas da semana</label><textarea id="k-notas">${esc(c.notas)}</textarea></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Cancelar</button>
      <button class="btn primary" id="k-save">Salvar</button>
    </div>
  `, (root) => {
    $('#k-save', root).addEventListener('click', async () => {
      const body = {
        nome: $('#k-nome').value, categoria: $('#k-cat').value, plataforma: $('#k-plat').value,
        orcamentoDiario: $('#k-orc').value, produtoId: $('#k-prod').value || null,
        objetivo: $('#k-obj').value, notas: $('#k-notas').value,
      };
      if (id) await api('PUT', `/api/campaigns/${id}`, body);
      else await api('POST', '/api/campaigns', body);
      closeModal();
      await refresh();
      toast('Campanha salva.');
    });
  });
};

// ---------------- Playbooks ----------------
async function renderKnowledge(view) {
  const items = await api('GET', '/api/knowledge');
  view.innerHTML = `<div class="kn-list">${items.map((k) => `
    <div class="card kn-item" data-slug="${esc(k.slug)}">
      <h3>${esc(k.titulo)}</h3>
      <p class="muted" style="margin-top:5px">Clique para ler</p>
    </div>`).join('')}</div>
    <div id="kn-content" style="margin-top:22px"></div>`;
  $$('.kn-item', view).forEach((el) => el.addEventListener('click', async () => {
    const { markdown } = await api('GET', `/api/knowledge/${el.dataset.slug}`);
    $('#kn-content').innerHTML = `<div class="card card-pad md">${mdToHtml(markdown)}</div>`;
    $('#kn-content').scrollIntoView({ behavior: 'smooth' });
  }));
}

// ---------------- Agentes / chat ----------------
async function renderAgents(view) {
  view.innerHTML = `
    <div class="agents-wrap">
      <div class="agent-list">${state.agents.map((a) => `
        <button class="agent-item ${a.id === currentAgent ? 'active' : ''}" data-agent="${a.id}">
          <span class="agent-emoji">${a.emoji}</span>
          <span><b>${esc(a.nome)}</b><span>${esc(a.descricao)}</span></span>
        </button>`).join('')}
        <button class="btn sm" id="clear-chat" style="margin-top:6px">Limpar conversa</button>
      </div>
      <div class="card chat">
        <div class="chat-msgs" id="chat-msgs"></div>
        <div class="typing hidden" id="typing">O agente está pensando…</div>
        <div class="chat-input">
          <textarea id="chat-text" placeholder="Pergunte ao ${esc((state.agents.find((a) => a.id === currentAgent) || {}).nome || 'agente')}… (Enter envia, Shift+Enter quebra linha)"></textarea>
          <button class="btn primary" id="chat-send">Enviar</button>
        </div>
      </div>
    </div>`;

  $$('.agent-item', view).forEach((el) => el.addEventListener('click', () => {
    currentAgent = el.dataset.agent;
    renderAgents(view);
  }));
  $('#clear-chat').addEventListener('click', async () => {
    await api('DELETE', `/api/chat/${currentAgent}`);
    renderAgents(view);
  });

  const msgs = await api('GET', `/api/chat/${currentAgent}`);
  const box = $('#chat-msgs');
  if (!msgs.length) {
    const a = state.agents.find((x) => x.id === currentAgent);
    box.innerHTML = `<div class="msg assistant md">Olá! Sou o <b>${esc(a.nome)}</b> ${a.emoji}. ${esc(a.descricao)}<br><br>${state.ia.configurada ? 'Como posso ajudar?' : '⚠️ A IA ainda não está configurada — defina <code>ANTHROPIC_API_KEY</code> no arquivo <code>.env</code> e reinicie.'}</div>`;
  } else {
    box.innerHTML = msgs.map((m) => m.role === 'user'
      ? `<div class="msg user">${esc(m.content)}</div>`
      : `<div class="msg assistant md">${mdToHtml(m.content)}</div>`).join('');
  }
  box.scrollTop = box.scrollHeight;

  const send = async () => {
    const ta = $('#chat-text');
    const text = ta.value.trim();
    if (!text) return;
    ta.value = '';
    box.insertAdjacentHTML('beforeend', `<div class="msg user">${esc(text)}</div>`);
    box.scrollTop = box.scrollHeight;
    $('#typing').classList.remove('hidden');
    $('#chat-send').disabled = true;
    try {
      const out = await api('POST', `/api/chat/${currentAgent}`, { message: text });
      box.insertAdjacentHTML('beforeend', `<div class="msg assistant md">${mdToHtml(out.text)}</div>`);
    } catch (err) {
      box.insertAdjacentHTML('beforeend', `<div class="msg assistant">⚠️ ${esc(err.message)}</div>`);
    }
    $('#typing').classList.add('hidden');
    $('#chat-send').disabled = false;
    box.scrollTop = box.scrollHeight;
  };
  $('#chat-send').addEventListener('click', send);
  $('#chat-text').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
}

// ---------------- boot ----------------
refresh().catch((err) => {
  document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif">Erro ao carregar: ${esc(err.message)}</div>`;
});
