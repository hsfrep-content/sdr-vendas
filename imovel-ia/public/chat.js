'use strict';

// Chat do assistente de imóveis (usado na página standalone e dentro do widget/iframe).
(function () {
  const $ = (s) => document.querySelector(s);
  const body = $('#chat-body');
  const form = $('#chat-form');
  const input = $('#chat-text');
  const send = $('#chat-send');
  const typing = $('#typing');
  const sugestoes = $('#sugestoes');

  if (new URLSearchParams(location.search).get('embed') === '1') {
    document.body.classList.add('embed');
  }

  let sessionId = sessionStorage.getItem('ael_ia_session') || null;
  let whatsapp = null;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  function scroll() { body.scrollTop = body.scrollHeight; }

  function addUser(text) {
    body.insertAdjacentHTML('beforeend', `<div class="msg user">${esc(text)}</div>`);
    scroll();
  }

  function cardHtml(im) {
    const preco = im.finalidade === 'aluguel' ? im.precoLocacao : im.precoVenda;
    const tags = [
      im.quartos ? `${im.quartos} quarto${im.quartos > 1 ? 's' : ''}` : null,
      im.suites ? `${im.suites} suíte${im.suites > 1 ? 's' : ''}` : null,
      im.area ? `${im.area} m²` : null,
      im.vagas ? `${im.vagas} vaga${im.vagas > 1 ? 's' : ''}` : null,
    ].filter(Boolean);
    return `<a class="imovel-card" href="${esc(im.url || '#')}" target="_blank" rel="noopener">
      <div class="imovel-foto">${im.fotos && im.fotos[0] ? `<img src="${esc(im.fotos[0])}" alt="" loading="lazy">` : '🏠'}</div>
      <div class="imovel-info">
        <div class="imovel-titulo">${esc(im.titulo)}</div>
        <div class="imovel-local">${esc([im.bairro, im.cidade].filter(Boolean).join(', '))}</div>
        <div class="imovel-tags">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
        <div class="imovel-preco">${preco ? brl(preco) : 'Consulte'}${im.finalidade === 'aluguel' ? ' <small>/mês</small>' : ''}</div>
      </div>
    </a>`;
  }

  function addBot(text, imoveis, leadRegistrado) {
    // O marcador [[IMOVEIS:id1,id2]] vira uma grade de cards.
    let cardsIds = [];
    const clean = text.replace(/\[\[IMOVEIS:([^\]]*)\]\]/gi, (m, ids) => {
      cardsIds.push(...ids.split(',').map((s) => s.trim()).filter(Boolean));
      return '';
    }).trim();

    if (clean) body.insertAdjacentHTML('beforeend', `<div class="msg bot">${esc(clean)}</div>`);

    const cards = cardsIds.map((id) => imoveis[id]).filter(Boolean);
    // fallback: se a IA buscou e não marcou, mostra o que a busca retornou
    if (!cards.length && cardsIds.length === 0 && Object.keys(imoveis || {}).length && /op[çc][õo]es|encontrei|separei/i.test(clean)) {
      cards.push(...Object.values(imoveis).slice(0, 6));
    }
    if (cards.length) {
      body.insertAdjacentHTML('beforeend', `<div class="cards">${cards.map(cardHtml).join('')}</div>`);
    }

    if (leadRegistrado && whatsapp) {
      body.insertAdjacentHTML('beforeend',
        `<a class="btn-wa" href="https://wa.me/${esc(whatsapp)}?text=${encodeURIComponent('Olá! Acabei de falar com o assistente do site sobre um imóvel.')}" target="_blank" rel="noopener">Falar agora no WhatsApp</a>`);
    }
    scroll();
  }

  async function enviar(text) {
    if (!text) return;
    addUser(text);
    input.value = '';
    send.disabled = true;
    typing.classList.remove('hidden');
    sugestoes.classList.add('hidden');
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Erro inesperado');
      sessionId = data.sessionId;
      sessionStorage.setItem('ael_ia_session', sessionId);
      whatsapp = data.whatsapp || whatsapp;
      addBot(data.text, data.imoveis, data.leadRegistrado);
    } catch (err) {
      body.insertAdjacentHTML('beforeend', `<div class="msg bot">⚠️ ${esc(err.message)}</div>`);
      scroll();
    }
    typing.classList.add('hidden');
    send.disabled = false;
    input.focus();
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); enviar(input.value.trim()); });
  sugestoes.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') enviar(e.target.textContent);
  });

  // Boas-vindas + status
  fetch('/api/status').then((r) => r.json()).then((s) => {
    whatsapp = s.whatsapp;
    if (s.empresa) {
      document.title = `Encontre seu imóvel com IA · ${s.empresa}`;
      const t = $('#chat-title'); if (t) t.textContent = `Assistente ${s.empresa}`;
    }
    const oi = s.ia.configurada
      ? 'Oi! 👋 Me conta o que você procura e eu te ajudo a encontrar o imóvel ideal.'
      : 'Oi! 👋 Nosso assistente está em manutenção neste momento. Fale com a equipe pelo WhatsApp que te atendemos na hora!';
    body.insertAdjacentHTML('beforeend', `<div class="msg bot">${esc(oi)}</div>`);
  }).catch(() => {
    body.insertAdjacentHTML('beforeend', '<div class="msg bot">Oi! 👋 Me conta o que você procura e eu te ajudo a encontrar o imóvel ideal.</div>');
  });

  // Vitrine de destaques (apenas na página completa; o widget/embed não mostra)
  if (!document.body.classList.contains('embed')) {
    fetch('/api/destaques').then((r) => r.json()).then(({ venda, aluguel }) => {
      const todos = [...(venda || []), ...(aluguel || [])];
      if (!todos.length) return;
      document.querySelector('#vitrine').hidden = false;
      document.querySelector('#vitrine-cards').innerHTML = todos.map(cardHtml).join('');
    }).catch(() => {});
  }
})();
