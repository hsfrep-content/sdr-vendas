'use strict';

// Utilitários compartilhados entre chat.js e imovel-detail.js: escape de HTML,
// formatação de moeda e o card de imóvel (mesma aparência em toda a experiência).
window.AelCards = (function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  function cardHtml(im) {
    const preco = im.finalidade === 'aluguel' ? im.precoLocacao : im.precoVenda;
    const tags = [
      im.quartos ? `${im.quartos} quarto${im.quartos > 1 ? 's' : ''}` : null,
      im.suites ? `${im.suites} suíte${im.suites > 1 ? 's' : ''}` : null,
      im.area ? `${im.area} m²` : null,
      im.vagas ? `${im.vagas} vaga${im.vagas > 1 ? 's' : ''}` : null,
    ].filter(Boolean);
    const href = `/imovel.html?id=${encodeURIComponent(im.id)}`;
    return `<a class="imovel-card" href="${esc(href)}" target="_blank" rel="noopener">
      <div class="imovel-foto">${im.fotos && im.fotos[0] ? `<img src="${esc(im.fotos[0])}" alt="" loading="lazy">` : '<span class="imovel-foto-fallback">🏠</span>'}
        <span class="imovel-foto-tag">${im.finalidade === 'aluguel' ? 'Aluguel' : 'Venda'}</span>
      </div>
      <div class="imovel-info">
        <div class="imovel-titulo">${esc(im.titulo)}</div>
        <div class="imovel-local">${esc([im.bairro, im.cidade].filter(Boolean).join(', '))}</div>
        <div class="imovel-tags">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
        <div class="imovel-preco">${preco ? brl(preco) : 'Consulte'}${im.finalidade === 'aluguel' ? ' <small>/mês</small>' : ''}</div>
      </div>
    </a>`;
  }

  return { esc, brl, cardHtml };
})();
