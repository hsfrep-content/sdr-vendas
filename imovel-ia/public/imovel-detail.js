'use strict';

// Página de detalhe do imóvel: busca /api/imovel/:id, monta galeria, ficha,
// CTA (IA pré-preenchida + WhatsApp direto) e a grade de imóveis semelhantes.
(function () {
  const $ = (s) => document.querySelector(s);
  const { esc, brl, cardHtml } = window.AelCards;

  const id = new URLSearchParams(location.search).get('id');
  const loading = $('#imv-loading');
  const content = $('#imv-content');

  if (!id) {
    loading.textContent = 'Imóvel não informado. Volte para a busca e escolha uma opção.';
    return;
  }

  fetch(`/api/imovel/${encodeURIComponent(id)}`)
    .then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Imóvel não encontrado.');
      return data;
    })
    .then(({ imovel, semelhantes, whatsapp }) => {
      loading.classList.add('hidden');
      content.classList.remove('hidden');

      document.title = `${imovel.titulo} · A&L Negócios Imobiliários`;
      $('#imv-tipo').textContent = `${imovel.tipo || 'Imóvel'} para ${imovel.finalidade === 'aluguel' ? 'alugar' : 'comprar'}`;
      $('#imv-titulo').textContent = imovel.titulo;
      $('#imv-local').textContent = [imovel.bairro, imovel.cidade, imovel.uf].filter(Boolean).join(', ');
      $('#imv-descricao').textContent = imovel.descricao || 'Fale com a nossa equipe para mais detalhes sobre este imóvel.';

      const tags = [
        imovel.quartos ? `${imovel.quartos} quarto${imovel.quartos > 1 ? 's' : ''}` : null,
        imovel.suites ? `${imovel.suites} suíte${imovel.suites > 1 ? 's' : ''}` : null,
        imovel.banheiros ? `${imovel.banheiros} banheiro${imovel.banheiros > 1 ? 's' : ''}` : null,
        imovel.vagas ? `${imovel.vagas} vaga${imovel.vagas > 1 ? 's' : ''}` : null,
        imovel.area ? `${imovel.area} m²` : null,
        imovel.condominio ? `Condomínio ${brl(imovel.condominio)}` : null,
      ].filter(Boolean);
      $('#imv-tags').innerHTML = tags.map((t) => `<span>${esc(t)}</span>`).join('');

      const preco = imovel.finalidade === 'aluguel' ? imovel.precoLocacao : imovel.precoVenda;
      $('#imv-preco').innerHTML = preco
        ? `${esc(brl(preco))}${imovel.finalidade === 'aluguel' ? '<small>por mês</small>' : '<small>à vista ou financiado</small>'}`
        : 'Consulte condições';

      // Galeria
      const fotos = imovel.fotos && imovel.fotos.length ? imovel.fotos : [];
      const main = $('#imv-gallery-main');
      const thumbs = $('#imv-gallery-thumbs');
      function setMain(url) { main.innerHTML = url ? `<img src="${esc(url)}" alt="">` : '<span class="fallback">🏠</span>'; }
      setMain(fotos[0]);
      if (fotos.length > 1) {
        thumbs.innerHTML = fotos.map((f, i) => `<img src="${esc(f)}" data-i="${i}" class="${i === 0 ? 'active' : ''}" alt="">`).join('');
        thumbs.addEventListener('click', (e) => {
          if (e.target.tagName !== 'IMG') return;
          setMain(fotos[Number(e.target.dataset.i)]);
          thumbs.querySelectorAll('img').forEach((im) => im.classList.remove('active'));
          e.target.classList.add('active');
        });
      }

      // CTAs
      const ctaIa = $('#cta-ia');
      if (ctaIa) ctaIa.dataset.texto = `Quero saber mais sobre este imóvel: ${imovel.titulo} (código ${imovel.id})`;
      const ctaWa = $('#cta-wa');
      if (ctaWa && whatsapp) {
        ctaWa.href = `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Olá! Vi o imóvel "${imovel.titulo}" (código ${imovel.id}) no site e quero mais informações.`)}`;
        ctaWa.classList.remove('hidden');
      }

      // Semelhantes
      if (semelhantes && semelhantes.length) {
        $('#semelhantes-section').hidden = false;
        $('#semelhantes-cards').innerHTML = semelhantes.map(cardHtml).join('');
      }
    })
    .catch((err) => {
      loading.textContent = `⚠️ ${err.message}`;
    });
})();
