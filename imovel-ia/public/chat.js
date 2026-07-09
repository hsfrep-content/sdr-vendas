'use strict';

// Chat do assistente de imóveis — funciona como drawer deslizante na home,
// como conteúdo de tela cheia no modo embed (widget.js embutido em outro
// site) e é acionado por qualquer botão com [data-open-chat] via site.js.
(function () {
  const $ = (s) => document.querySelector(s);
  const embed = document.documentElement.classList.contains('embed-mode');

  const drawer = $('#chat-drawer');
  const backdrop = $('#chat-backdrop');
  const body = $('#chat-body');
  const form = $('#chat-form');
  const input = $('#chat-text');
  const send = $('#chat-send');
  const typing = $('#typing');
  const sugestoes = $('#sugestoes');
  const closeBtn = $('#chat-close');

  let sessionId = sessionStorage.getItem('ael_ia_session') || null;
  let whatsapp = null;

  const { esc, cardHtml } = window.AelCards;

  function scroll() { body.scrollTop = body.scrollHeight; }

  function openDrawer() {
    drawer.classList.add('open');
    if (backdrop) backdrop.classList.add('show');
    input.focus();
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('show');
  }

  if (embed) {
    openDrawer(); // sempre visível em tela cheia; CSS remove backdrop/botão fechar
  } else {
    window.addEventListener('ael:abrir-chat', (e) => {
      openDrawer();
      const texto = e.detail && e.detail.texto;
      if (texto) enviar(texto);
    });
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
    if (backdrop) backdrop.addEventListener('click', closeDrawer);
  }

  function addUser(text) {
    body.insertAdjacentHTML('beforeend', `<div class="msg user">${esc(text)}</div>`);
    scroll();
  }

  function addBot(text, imoveis, leadRegistrado) {
    let cardsIds = [];
    const clean = text.replace(/\[\[IMOVEIS:([^\]]*)\]\]/gi, (m, ids) => {
      cardsIds.push(...ids.split(',').map((s) => s.trim()).filter(Boolean));
      return '';
    }).trim();

    if (clean) body.insertAdjacentHTML('beforeend', `<div class="msg bot">${esc(clean)}</div>`);

    const cards = cardsIds.map((id) => imoveis[id]).filter(Boolean);
    if (!cards.length && cardsIds.length === 0 && Object.keys(imoveis || {}).length && /op[çc][õo]es|encontrei|separei/i.test(clean)) {
      cards.push(...Object.values(imoveis).slice(0, 6));
    }
    if (cards.length) body.insertAdjacentHTML('beforeend', `<div class="msg-cards">${cards.map(cardHtml).join('')}</div>`);

    if (leadRegistrado && whatsapp) {
      body.insertAdjacentHTML('beforeend',
        `<a class="btn-wa-msg" href="https://wa.me/${esc(whatsapp)}?text=${encodeURIComponent('Olá! Acabei de falar com o assistente do site sobre um imóvel.')}" target="_blank" rel="noopener">Falar agora no WhatsApp</a>`);
    }
    scroll();
  }

  async function enviar(text) {
    if (!text) return;
    addUser(text);
    input.value = '';
    send.disabled = true;
    typing.classList.remove('hidden');
    if (sugestoes) sugestoes.classList.add('hidden');
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
  if (sugestoes) sugestoes.addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') enviar(e.target.textContent); });

  // Busca do hero (só existe fora do modo embed) — abre o drawer já com a mensagem enviada.
  const heroForm = $('#hero-search-form');
  if (heroForm) {
    heroForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const texto = $('#hero-search-input').value.trim();
      if (!texto) return;
      $('#hero-search-input').value = '';
      openDrawer();
      enviar(texto);
    });
  }
  document.querySelectorAll('.hero-chips [data-chip]').forEach((btn) => {
    btn.addEventListener('click', () => { openDrawer(); enviar(btn.dataset.chip); });
  });

  // Boas-vindas + status (empresa, whatsapp) + vitrine de destaques (fora do modo embed)
  fetch('/api/status').then((r) => r.json()).then((s) => {
    whatsapp = s.whatsapp;
    if (s.empresa) {
      document.title = `${document.title.split('·')[0].trim()} · ${s.empresa}`;
      const t = $('#chat-title'); if (t) t.textContent = `Assistente ${s.empresa}`;
    }
    const totalEl = $('#stat-total');
    if (totalEl && s.inventario) totalEl.textContent = s.inventario.total;
    const oi = s.ia.configurada
      ? 'Oi! 👋 Me conta o que você procura e eu te ajudo a encontrar o imóvel ideal.'
      : 'Oi! 👋 Nosso assistente está em manutenção neste momento. Fale com a equipe pelo WhatsApp que te atendemos na hora!';
    body.insertAdjacentHTML('beforeend', `<div class="msg bot">${esc(oi)}</div>`);
  }).catch(() => {
    body.insertAdjacentHTML('beforeend', '<div class="msg bot">Oi! 👋 Me conta o que você procura e eu te ajudo a encontrar o imóvel ideal.</div>');
  });

  if (!embed) {
    const destaquesEl = $('#destaques-cards');
    if (destaquesEl) {
      fetch('/api/destaques').then((r) => r.json()).then(({ venda, aluguel }) => {
        const todos = [...(venda || []), ...(aluguel || [])];
        destaquesEl.innerHTML = todos.length
          ? todos.map(cardHtml).join('')
          : '<p style="grid-column:1/-1;color:var(--ink-faint)">Em breve, novos imóveis por aqui.</p>';
      }).catch(() => {});
    }
  }
})();
